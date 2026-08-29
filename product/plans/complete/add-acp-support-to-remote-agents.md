# add ACP support to remote agents

**Complexity: 6/10** — a new seven-frame protocol surface with a version bump, two new modules plus edits across six existing files, and real lifecycle reasoning about which errors kill a session and which do not; held down from higher by an exact existing precedent (`src/remote/shell-session.ts`) to copy on the local side, no `web/` or `src/protocol.ts` work at all, and an untouched tool loop.

Make `acp <prompt>` work in a remote agent tab by running the ACP agent on the far side, inside the remote workspace clone, over the ssh channel the tab already owns. Today it does not work at all: `AcpManager.run` (`src/acp/manager.ts:103`) resolves the tab's cwd — which for a remote tab is a path on the *other* machine — and hands it to `connectAcp` (`src/acp/index.ts:27`), which spawns `opencode acp` locally with that cwd. The spawn fails, `onError` fires, and the tab prints an `ACP: failed to start ACP agent: …` line. A remote agent tab is otherwise deliberately indistinguishable from a local one (`product/specs/remote-server.md`), and `acp` is the last per-tab capability that still assumes the tab's work happens on this machine.

The ACP client itself moves to the remote. `janus remote-serve` hosts the `ClientSideConnection`, spawns `opencode acp` in the workspace it provisioned, and pushes reply chunks back over the channel; the wire carries prompts and reply text, never JSON-RPC. The local side keeps everything else — the autonomous `db`/`browser`/`question` tool loop, the transcript entries, the busy dot, the notifications, and the choice of which agent and model to run — so `runAcpToolLoop` (`src/acp/loop.ts`) and `AcpManager.run` are untouched. What changes is only where the `AcpSession` behind them comes from, which is the same seam `ShellManager.spawnFor` (`src/shell-manager.ts:75`) already uses to give a remote tab a remote shell.

This costs a remote protocol version bump (6 → 7) and widens `remote-serve`'s deliberately closed capability surface by one item. Both are stated as decisions below rather than treated as incidental.

## Design decisions

1. **The agent process runs on the remote, in the remote workspace clone.** `acp <prompt>` in a tab launched with `agent <name> on <address>` spawns `opencode acp` on the far side with the provisioned workspace as its cwd, so the agent sees the files the tab is actually working on. Replies stream back and render as Markdown exactly as a local reply does, with no banner or marker distinguishing them.

2. **The ACP client lives on the remote; the wire carries prompts and chunks.** `remote-serve` owns the `ClientSideConnection`, the `initialize`/`newSession` handshake, and the session id. The alternative — piping raw ndJSON JSON-RPC through the existing `spawn`/`input`/`output` process frames, the way the remote shell does — was considered and rejected here: `RemoteProcesses.spawnPipe` (`src/remote/serve-processes.ts:66`) merges the child's stdout and stderr into one `output` stream, and anything `opencode` writes to stderr would land mid-frame in a stream that must be strictly newline-delimited JSON. Keeping the JSON-RPC entirely on one host removes that failure mode. The cost is stated plainly: `remote-serve`'s capability surface grows from "provision a clone, run processes in it, tail a transcript, remove the clone" to include "drive one ACP agent in it," and `product/specs/remote-server.md` must say so.

3. **The local side decides which agent and model run; `remote-serve` runs what it is told.** The open frame carries the command, its arguments, and the environment overrides — today `opencode`, `['acp']`, and `OPENCODE_CONFIG_CONTENT` built from the `ACP_MODEL` constant (`src/acp/manager.ts:14-16`). One definition of "which agent and model" stays on this machine, so a remote session behaves identically to a local one and the two installations cannot silently disagree about the model. This carries no new trust: the `spawn` frame already names a command the remote runs.

4. **The connections panel and status popup read identically to a local session, from the same local constant.** `connection list` keeps its fixed `acp:opencode` row (`src/connection/list.ts:13,30`, `lines.push('acp:opencode')`) and `connection close acp` keeps its existing wording, with no host marker anywhere. The tab's status popup keeps showing `parseModel(ACP_MODEL)`'s `provider/model` through `AcpManager.label` (`src/acp/manager.ts:50-54`) on both paths.

   Having the remote report its own provider and model back was considered and rejected on inspection: what `connectAcp` reports as the model is not a model. It is the session's current *mode* name — `modes.availableModes.find((m) => m.id === modes.currentModeId)?.name`, with the leading comment "model is best-effort from the session's current mode (ACP has no model field)" (`src/acp/index.ts:73-77`). Recording it would make the popup read `opencode/build` instead of `opencode/gemini-3.1-flash-lite`, a regression on the remote path and, if applied uniformly, on the local one too. `AcpManager` already discards what `connectAcp` reports and uses the constant (`src/acp/manager.ts:62,67`); that stays true, and decision 3 is what makes it correct — the local side chose the model, so the local side already knows it. The ready frame therefore carries the session id and nothing else: its only job is to tell `AcpManager` the handshake completed so `hooks.onConnect` can fire and the connection label resolve.

5. **A dead session is reported and forgotten; a failed prompt is not.** The two are distinguished, because collapsing them would be wrong in both directions. A **fatal** error — `opencode` missing from the remote PATH, an authentication failure at spawn, or the agent process exiting — means the session no longer exists, so it is reported as an `ACP: <message>` transcript entry, the tab stays open, and the session record is dropped on both ends; the next `acp <prompt>` spawns a fresh one rather than writing into a corpse. A **non-fatal** error — the prompt itself failing, most importantly a rate-limit reply, which `AcpManager.run` already detects and notifies on (`src/acp/manager.ts:128,133`, `isRateLimitError`) — leaves a live session alone, because killing it would throw away the accumulated conversation for a condition that clears on its own.

   Mechanically this is the distinction between the two error channels that already exist: the connection-level `onError` hook `session()` is given (`src/acp/manager.ts:104`) closes the session; the loop's prompt-level `error` handler (`:133`) does not. The error frame therefore carries a `fatal` flag, since only the remote can tell which it is. This changes local behavior too and deliberately so — a locally dead subprocess has exactly the same corpse problem today.

   There is no preflight check for `opencode` on the remote: the spawn's own failure message is the accurate one, and a preflight would add a round trip to every first prompt.

6. **A crashed agent reports through the existing error channel, not a new one.** `connectAcp` today only wires `proc.on('error')` (`src/acp/index.ts:42`), which fires when the spawn itself fails — nothing watches for the child exiting afterwards, so a crashed `opencode` leaves a session whose next prompt writes into a closed stdin and never returns. Decision 5 names that case, so it has to be handled: wire `proc.on('exit')` to call the same `options.onError` with `ACP agent exited.`, guarded by a flag that `kill()` sets so a deliberate close does not report a spurious error. No new option on `AcpOptions` and no new callback — the connection-level channel already exists and already means "this session is gone." This fixes the local path at the same time, which is where the defect lives today.

7. **`acp` in a tab that is still provisioning is refused, not queued.** `RemoteManager.open` registers the channel entry immediately, so `managers.remote.get(label)` returns a channel well before ssh has authenticated and the handshake has landed. `RemoteChannel.send` silently drops every frame until then (`src/remote/channel.ts:62-65`, `if (this.state !== 'attached') return`), so a prompt typed into a provisioning tab would hang forever with the busy dot lit and no error. `AcpManager.run` therefore checks the existing `channel.attached` getter (`src/remote/channel.ts:54`) before starting anything and appends `ACP: the remote session is still connecting.` without creating a transcript entry, a busy state, or a loop. Queueing was rejected: `send` and `schedule` queue because they are delivered *to* a tab by something else, while `acp` is typed by a person who can retype it, and the shape matches the existing `Usage: acp <prompt>.` refusal (`src/acp/manager.ts:101`).

8. **`acp reset` disposes the session on the remote; a dropped channel says nothing extra.** `acp reset` sends a close frame, the remote kills its ACP subprocess and forgets its session, and the existing `ACP session reset — next acp prompt will start fresh.` message is unchanged (`src/commands/acp-reset.ts:11`). A dropped ssh channel already closes the whole tab (`product/specs/remote-server.md` § Lifecycle and cleanup), so the session dies with the tab and gets no separate report; a prompt in flight when the channel drops surfaces the ordinary `ACP:` error first, because the channel's close path is what triggers it.

   Closing a tab is the one place where the close frame may not arrive: `src/tab/cleanup.ts:28` calls `managers.acp.close(tab.label)` and the tab's channel is torn down in the same pass, so depending on the order the frame is either sent or silently dropped by `RemoteChannel.send`'s not-attached guard. Either outcome is correct and neither needs ordering work — `remote-serve` dies with its ssh channel and takes its ACP subprocess and its workspace clone with it (`src/remote/serve.ts:71-78`, `CHANNEL_SIGNALS`). Say so rather than leaving an implementer to discover the race and try to fix it.

9. **An ACP-level error is not a channel-level fault.** `RemoteChannel.fail` (`src/remote/channel.ts:148`) kills the transport, and killing the transport closes the tab. An agent that fails to spawn or errors mid-prompt must therefore travel as its own error frame routed to the ACP listener, never through `fail`. Only a malformed or unknown frame keeps the existing meaning.

10. **The tool loop stays local, unchanged.** `db`, `browser`, and `question` commands the remote agent emits execute on this machine through the same primers, extractors, and `runCommand` wiring `AcpManager.run` already builds. Only the agent process moved; `runAcpToolLoop` never learns that its session is remote. The consequence worth naming: a remote agent asked to inspect a database is inspecting *this* machine's database files, not the remote workspace's. Running tool commands on the remote is a separate change (see Out of scope).

11. **The remote ACP session is addressed by an id, minted locally, like every other remote process.** Every ACP frame carries an `id` chosen by the local adapter (`racp1`, `racp2`, …, mirroring the `rsh<n>` ids `ShellManager` mints at `src/shell-manager.ts:79`). This is not decoration: after `acp reset`, a chunk still in flight from the disposed session would otherwise be delivered into the new one's transcript entry. Routing by id makes a stale frame land on a detached listener and be dropped, using the same mechanism `RemoteChannel.attach`/`detach` already provides.

12. **Frame payload text is base64-encoded, matching the existing codec.** Prompt text and reply chunks travel exactly as `input`, `output`, and `transcript` blocks do (`src/remote/protocol.ts:73-77`), so no newline or control byte in a prompt or a reply can be mistaken for framing. JSON string escaping would technically suffice; matching the file's one convention is worth more than saving the encode.

13. **`REMOTE_PROTOCOL_VERSION` goes to 7.** New frames the far end must honor are a contract change by that file's own stated rule, and an installation that ignored them would accept prompts and answer nothing — the exact "looks healthy while doing the wrong thing" failure the version check exists to prevent. Both ends must be updated together, and a stale remote is refused at the handshake before a tab is provisioned.

14. **The remote's ACP subprocess gets the same merged credentials its other processes get.** `RemoteProcesses` receives `{ ...own, ...forwarded }` (`src/remote/serve.ts:124`) — the forwarded token wins, the remote's own file is the fallback. `connectAcp` currently ignores that and calls `getProjectTokens()` itself (`src/acp/index.ts:33`), which on the remote returns only the remote's own credentials, so a forwarded `OPENCODE_API_KEY` or `GEMINI_API_KEY` would be dropped for exactly the sessions that need it most. `AcpOptions` gains an optional token map and `connectAcp` prefers it, leaving every existing caller behaving as before.

15. **Remote agent tabs only.** A remote harness tab is already driving its own agent binary in a terminal, and `acp` there is out of scope for this change — named explicitly in the spec as a documented follow-up rather than left unmentioned, so the next reader knows it was a decision and not an oversight.

16. **The inter-agent `request` path comes along with it, deliberately.** `acp` is reachable from two entry points, not one: the `acp` command (`src/commands/acp.ts:6`) and the shared command-capture path behind `msg …request` (`src/capture/manager.ts:40`, `if (c.name === 'acp') { this.managers.acp.run(label, trimmed, callback); return; }`). Both call the same `AcpManager.run`, so a `request` addressed to a remote agent tab starts a remote ACP session with no extra work — and with the same still-connecting refusal from decision 7, which arrives as that request's answer. This is the intended behavior and needs a test, not a guard.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `createRemoteShell` — the "wear a local shape, speak frames" adapter this change copies wholesale | `src/remote/shell-session.ts` |
| `ShellManager.spawnFor`'s `tab?.remote ? remote.get(label) : undefined` branch — the exact seam `AcpManager.session` needs | `src/shell-manager.ts:75-80` |
| `RemoteChannel.attach`/`detach`/`send` and its id-keyed listener routing | `src/remote/channel.ts:58-65,130-146` |
| Frame codec, base64 payload convention, handshake, and version check | `src/remote/protocol.ts:67-128` |
| Per-frame validation shape (`nonEmptyString`, `optionalNonEmptyString`, `decodeTokens`, `malformed`) | `src/remote/frame-decode.ts:8-33` |
| `connectAcp` — the ACP client itself, reused verbatim on the remote | `src/acp/index.ts:27` |
| `runAcpToolLoop` and every `AcpManager.run` handler — untouched, injected side effects | `src/acp/loop.ts:15`, `src/acp/manager.ts:99-135` |
| `AcpSession` / `PromptHandlers` — the two-method shape the adapter must satisfy | `src/acp/types.ts:1-13` |
| Merged forwarded/own token map already computed on the remote | `src/remote/serve.ts:120-125` |
| `RemoteServer.shutdown`'s kill-everything-then-remove-the-clone path | `src/remote/serve.ts:71-78` |
| Fake-PTY channel test harness (drives the state machine with no real ssh) | `src/remote/channel.test.ts` |
| `RemoteServer` with injected `emit`/`exit`, for driving the far side in tests | `src/remote/serve.ts:41-47` |
| `RemoteChannel.attached` getter — the provisioning check decision 7 needs, already written | `src/remote/channel.ts:54` |
| `createRemotePtySession`'s "options object → one spawn frame" shape, the closest model for the open frame | `src/remote/pty-session.ts:31-36` |
| `tab.offline`, already set at launch and already ridden across on the spawn frame | `src/harness/manager.ts:171`, `src/remote/pty-session.ts:36` |
| The second `AcpManager.run` entry point (`msg …request`), which needs no change | `src/capture/manager.ts:40` |

## Proposed changes

### `src/remote/protocol.ts` — three client frames, four server frames

Add to `ClientFrame`: an open frame carrying the session id, the command, its argument list, an optional environment-override map, and an optional `offline` flag; a prompt frame carrying the id and the prompt text; and a close frame carrying the id. Add to `ServerFrame`: a ready frame carrying the id alone (decision 4 — it signals "handshake done" and nothing more); a chunk frame carrying the id and a slice of reply text; an end frame carrying the id and the ACP stop reason; and an error frame carrying the id, a message, and the `fatal` flag decision 5 turns on.

Extend `toWire` so the prompt frame's text and the chunk frame's text are base64-encoded alongside the existing `input`/`output`/`transcript` cases (decision 12). Add the new type names to `CLIENT_TYPES` and `SERVER_TYPES`. Move `REMOTE_PROTOCOL_VERSION` to `7` and extend that constant's comment block with the reason, following the shape the existing version history already uses in that comment.

The file is at 139 counted lines; the additions are mostly type members and comments, and comments are not counted (`eslint.config.mjs`, `skipComments: true`). Confirm with `./scripts/run.mjs lint-files` rather than assuming — if it goes over, the union members split out into a sibling module, not a compaction.

### `src/remote/frame-decode.ts` — validate all seven

One decoder per new frame, in the file's existing style. The rules that matter, since "every frame is validated before dispatch" is a spec commitment (`product/specs/remote-server.md` § Failures):

- The id must be a nonempty string on every one of them.
- The open frame's command must be a nonempty string; its args must be an array of strings (an empty array is valid); its environment map, when present, must be a plain object whose every value is a string — reject arrays and `null`, as `decodeTokens` does; `offline`, when present, must be a boolean.
- The prompt and chunk frames' text must be a string, decoded from base64 the way `decodeAddressedData` does. An empty prompt cannot occur (`AcpManager.run` rejects it before sending), but an empty chunk is ordinary and must not be refused.
- The ready frame carries the id and nothing else.
- The end frame's stop reason and the error frame's message must be nonempty strings; the error frame's `fatal` must be a boolean, and is required rather than optional — an absent flag would default a dead session to "recoverable," which is the wrong way for this one to fail.

Undeclared properties are discarded rather than forwarded, matching every existing decoder. Add the seven cases to `decodeKnownFrame`'s switch. At 113 lines with roughly 30 to add, the file has headroom.

### `src/remote/channel.ts` — route ACP frames to a second listener map

Add a listener shape for an ACP session — connected, chunk, end, and error callbacks — and a second id-keyed map beside `sessions`, with `attachAcp`/`detachAcp` methods mirroring `attach`/`detach` (`src/remote/channel.ts:58-60`). In `dispatch`, route the four server ACP frames to that map by id *before* the `switch` that ends in `fail`, so an ACP-level error never kills the transport (decision 9). A frame whose id has no attached listener is dropped silently, which is what makes decision 11's staleness guarantee hold. Clear the new map in `closed()` alongside `sessions` (`src/remote/channel.ts:90`, `this.sessions.clear()`).

`ChannelFrame` — the union of frames handed to `RemoteChannelHandlers.onFrame` — does not change: ACP frames are addressed to a session, like `output` and `exit`, not broadcast to the tab's owner.

### New module `src/remote/acp-session.ts` — the local adapter

Exports one factory returning an `AcpSession` (`src/acp/types.ts:7`), built from a channel, an id, the launch parameters, and the manager's connect/error hooks. Its job is small and directly parallels `createRemoteShell`:

- On construction, attach an ACP listener for its id and send the open frame carrying the command, args, environment overrides, and offline flag.
- `prompt(text, handlers)` records the handlers as the in-flight pair and sends the prompt frame. Chunk frames feed `onChunk` and the end frame feeds `onEnd` with the stop reason — the same one-in-flight-prompt discipline `connectAcp` keeps with its `current` variable (`src/acp/index.ts:45,85,94`). A ready frame invokes the connect hook.
- An error frame splits on its `fatal` flag (decision 5): non-fatal goes to the in-flight prompt's `onError`, fatal goes to the connection-level error hook the factory was given, which is the one `AcpManager` wires to close the session. A fatal error with a prompt in flight goes to both, so the running loop terminates rather than waiting on a reply that will never come.
- `kill()` sends the close frame, detaches the listener, and is idempotent, matching the `live` guard `createRemoteShell` uses (`src/remote/shell-session.ts:49-55`).

The module holds no reference to `Managers`, the tab, or the transcript — it converts frames to callbacks and nothing else.

### `src/acp/manager.ts` — branch on the tab's remote channel

`session(label, cwd, hooks)` gains the same branch `ShellManager.spawnFor` already has (`src/shell-manager.ts:76-80`): look up the tab, and when it has a `remote` target and `managers.remote.get(label)` returns a channel, build a remote session through the new factory instead of calling `connectAcp`. `session` has exactly one caller — `run` at `src/acp/manager.ts:103` — so its signature is free to change; `cwd` becomes unused on the remote branch, because the far side supplies the workspace directory it provisioned and the local `cwdOf(label)` for a remote tab is a path on the other machine. The launch parameters are the constants this file already owns (`ACP_COMMAND`, `ACP_ARGS`, and the `OPENCODE_CONFIG_CONTENT` value built from `ACP_MODEL`, `src/acp/manager.ts:14-16,68`), plus the tab's `offline` flag — decision 3. Mint the id from a private counter, as `ShellManager` does for `rsh<n>` (`src/shell-manager.ts:32,79`).

Recording the model info does **not** change: `this.info.set(label, parseModel(ACP_MODEL))` on connect stays exactly as it is on both paths, per decision 4. The connect hook's existing `() => …` shape (`src/acp/manager.ts:67`) already ignores any reported argument, so the remote adapter's ready frame needs to carry nothing.

Add decision 7's provisioning guard to `run`, beside the existing empty-prompt refusal at `src/acp/manager.ts:101`: when the tab is remote and its channel is not `attached`, append the still-connecting line and return before `session()`, `addBusy`, or `runAcpToolLoop` are reached.

Add decision 5's dead-session drop to the connection-level `onError` hook `run` passes to `session()` (`src/acp/manager.ts:104`) — it already appends the `ACP: <message>` entry, and now also calls `this.close(label)`, the same method `acp reset` (`src/commands/acp-reset.ts:7`) and tab cleanup (`src/tab/cleanup.ts:28`) use, so the close frame is sent through one path. The loop's prompt-level `error` handler (`:133`) is deliberately left alone, so a rate-limited session keeps its context.

At 136 counted lines with roughly 25 to add, the file is close enough to 200 that this must be measured rather than assumed. If it goes over, extract the branch and its launch parameters into a sibling `src/acp/session-for-tab.ts` — an extraction, not a compaction, per `ai/guidelines/code-guidelines.md`.

### `src/acp/types.ts` and `src/acp/index.ts` — an explicit token map and an exit watcher

`AcpOptions` gains an optional `tokens` field of the existing `ProjectTokens` type, documented as "the credentials to inject; defaults to this project's own." `connectAcp` passes `options.tokens ?? getProjectTokens()` into `sandboxSpawn` where it currently passes `getProjectTokens()` unconditionally (`src/acp/index.ts:33`). All three existing call sites — `src/acp/manager.ts:64` and `src/monitor/acp.ts:21,31` — omit the field and behave exactly as before; the remote holder supplies the merged map (decision 14).

Separately, wire `proc.on('exit')` beside the existing `proc.on('error')` (`src/acp/index.ts:42`) to call `options.onError('ACP agent exited.')`, suppressed by a flag that `kill()` sets first (`:98-100`) so a deliberate close reports nothing. That is decision 6, and it is what makes a crashed agent reach `AcpManager`'s connection-level hook and get the session dropped instead of leaving a corpse — on the local path as much as the remote one. This reaches the monitor path too: `spawnMonitorSession` (`src/monitor/acp.ts:21,31`) passes its own `onError`, so a monitor agent that dies now reports through it where it previously said nothing. That is the intended improvement, and `src/monitor/acp.test.ts` is where it gets pinned.

### New module `src/remote/serve-acp.ts` — the far side's ACP holder

A small class owning at most one live ACP session for the server, constructed with the emit function, the workspace directory, and the merged token map — the same three things `RemoteProcesses` is constructed with (`src/remote/serve.ts:120-125`). It exposes open, prompt, close, and a dispose for shutdown:

- **Open** records the id and calls `connectAcp` with the frame's command and args, the workspace directory as both `cwd` and `workspaceDir` (so the subprocess is confined exactly as the remote's other workspaced processes are), the frame's environment overrides and offline flag, the merged tokens, an `onError` that emits a **fatal** error frame for that id, and an `onConnect` that emits the ready frame. An open for an id that is already live is ignored, matching `RemoteProcesses.spawn`'s duplicate guard (`src/remote/serve-processes.ts:28`, `if (this.entries.has(frame.id)) return`).
- **Prompt** forwards to the session's `prompt`, emitting a chunk frame per chunk and an end frame on completion. A prompt-level failure emits a **non-fatal** error frame; the fatal ones arrive instead through the connection-level `onError` above, which is precisely the split decision 5 relies on and the reason `connectAcp`'s two error channels must not be merged here. A prompt for an unknown id emits a fatal error frame rather than being silently dropped, so a desynchronized local side stops waiting.
- **Close** and **dispose** kill the subprocess and forget the id; both are idempotent. Because `connectAcp`'s `kill()` sets the suppression flag from decision 6, neither produces a spurious exit error.

The module imports `connectAcp` and the frame types and nothing else from the host.

### `src/remote/serve.ts` — dispatch three more frames

Construct the ACP holder in `provision`, beside `RemoteProcesses` (`src/remote/serve.ts:120-125`), from the same merged token map and workspace directory. Add three cases to `dispatch`'s switch (`:89-97`) delegating to it. Add its disposal to `shutdown` beside `this.processes?.killAll()` and before `this.workspaces.removeAll()` (`src/remote/serve.ts:75-76`), so the clone is never removed out from under a live agent. An ACP frame arriving before provisioning reuses the existing `refuse` path and the exact message `spawn` already gives for the same condition — `'No remote workspace has been provisioned.'` (`src/remote/serve.ts:134`) — rather than inventing a second wording for the same fault.

The file is at 175 of 200 counted lines. Three thin delegating cases and one construction fit, but only just — measure at this step, and if it goes over, move the ACP construction and dispatch into a small `serve-acp-wire.ts` in the shape `src/harness/capture-wire.ts` established, rather than compacting.

### Protocol and client

`src/protocol.ts` and `web/src/` are untouched. The remote frame contract is a separate wire from the browser's, and everything the client sees — the Markdown buffer line, the busy dot, the connections rows — already flows through the existing tab view.

### Specs

- **`product/specs/acp.md`** — add a "Remote agent tabs" section: `acp <prompt>` in a tab launched with `on <address>` runs the agent on that host inside the remote workspace clone; the ACP client is hosted by `remote-serve`, so prompts and reply chunks cross the ssh channel rather than JSON-RPC; the agent and model are chosen locally and sent across; the tool loop and its `db`/`browser`/`question` commands still run on the local machine; a prompt issued before the remote session is established answers `ACP: the remote session is still connecting.` verbatim; a dead session is reported as `ACP: <message>` and forgotten so the next prompt retries, while a rate-limited one is kept; `acp reset` disposes the remote session; a dropped channel closes the tab and reports nothing extra. Cross-link `[[remote-server]]`. Correct the § Connection lifecycle sentence that says the subprocess inherits the tab's cwd and is confined by "the same Seatbelt sandbox as the tab's shell/harness PTY" — for a remote tab the confinement is the remote's, which means none on a non-macOS remote. The § Database and browser assistance section also needs the sentence that its commands run on the local machine regardless of where the agent does.
- **`product/specs/remote-server.md`** — extend § What is computed where with the ACP split (agent on the remote, tool loop local, model chosen locally); amend § `janus remote-serve`'s capability-surface sentence to include driving one ACP agent inside the workspace; add the version-7 paragraph to § Failures in the shape the existing version history uses there, naming the "accepts prompts, answers nothing" failure it prevents; extend the post-handshake validation paragraph with the new frames' rules; add remote harness tabs' `acp` and remote execution of tool commands to § Out of scope.

### Documentation

- `documentation/user-documentation/advanced-agents/acp-agent.md` — a short section saying `acp` works in a remote agent tab and the agent runs on the remote host against the remote workspace's files, with the one caveat a user can actually trip over: `db` and `browser` commands the agent runs still act on the machine janissary is running on. No file paths, no module names, no protocol detail.
- `documentation/user-documentation/advanced-agents/remote-agents.md` — one paragraph cross-linking to the ACP page, plus the practical prerequisite: `opencode` must be installed and authenticated on the remote, or its API key configured locally so it is forwarded.

### Implementation order

Each step should leave typecheck and tests green on its own:

1. `AcpOptions.tokens`, the `connectAcp` token fallback, and the exit watcher (decisions 14 and 6). Standalone: no caller passes `tokens` yet, and the exit watcher is a local-path fix that stands on its own.
2. Protocol frames, decoders, and the version bump. Nothing sends or handles them yet, so this lands as a pure contract step with its decoder tests.
3. Channel routing, `attachAcp`/`detachAcp`, and the `closed()` clear. Still inert.
4. `src/remote/serve-acp.ts` and the `serve.ts` dispatch — the far side works end to end against a driven `RemoteServer` before any local caller exists.
5. `src/remote/acp-session.ts`, the `AcpManager` branch, the provisioning refusal, and the fatal-error session drop. This is the step that makes the feature reachable.
6. Specs and documentation.

Step 1 is independent of the rest. Steps 2–4 depend on each other in order; step 5 depends on all of them.

This plan depends on no other plan landing first, and conflicts with none in flight: the one other draft, `product/plans/draft/ssh-tab-session-recording.md`, touches `src/harness/*`, `src/ssh-manager.ts`, and `src/notifications.ts`, none of which appear here.

## Tests

Server tests only (vitest project `server`), colocated as `src/**/*.test.ts`. No `web/` tests — nothing crosses the browser wire.

- **`src/remote/protocol.test.ts`** — extend the existing round-trip suite: each new frame encodes and decodes to an equal value; prompt and chunk text survives newlines, backticks, and non-ASCII through the base64 path; the handshake refuses version 6 with a message naming both versions.
- **`src/remote/protocol.test.ts`** again, for the decode cases — this is where they live: there is no `frame-decode.test.ts`, and the existing `Malformed remote frame` assertions sit at `src/remote/protocol.test.ts:73,77,101`. A missing or empty id, a non-array args list, an environment map that is an array or holds a non-string value, a non-boolean `offline`, a missing `fatal`, and an empty stop reason each yield `Malformed remote frame "<type>".`; an empty chunk is accepted; undeclared properties are dropped rather than forwarded.
- **`src/remote/channel.test.ts`** — a chunk frame reaches the attached ACP listener and not `onFrame`; an error frame reaches the listener and does *not* kill the transport or fire `onError` (the decision-9 regression guard); frames for a detached id are dropped without faulting the channel; `closed()` clears the ACP listeners; an unknown frame type still fails the channel as it does today.
- **New `src/remote/serve-acp.test.ts`** — with `connectAcp` faked at the module boundary: open emits a ready frame; a prompt's chunks and end each emit the matching frame with the right id; a prompt-level failure emits a non-fatal error frame while a connection-level one emits a fatal frame (the decision-5 guard, and the assertion most worth writing in this file); a duplicate open is ignored; a prompt for an unknown id emits a fatal error frame; close and dispose kill the subprocess once and are safe to call twice. Assert the options handed to `connectAcp` carry the workspace directory as both `cwd` and `workspaceDir`, the frame's env and offline flag, and the merged token map with a forwarded token beating the remote's own — the decision-14 guard, mirroring the forwarded-token assertions already at `src/remote/serve.test.ts:150,190`.
- **`src/remote/serve.test.ts`** — an ACP frame before provisioning is refused with the existing no-workspace message; after provisioning the three frames reach the holder; `shutdown` disposes the holder before removing the clone, extending the existing `removes the clone when the session ends` case (`:226`).
- **New `src/remote/acp-session.test.ts`** — against a fake channel: construction attaches a listener and sends the open frame with the expected command, args, env, and offline flag; `prompt` sends the prompt frame and routes chunk and end to the in-flight prompt's handlers; a non-fatal error reaches the prompt handlers only, a fatal error reaches the connection hook, and a fatal error during a prompt reaches both; a ready frame invokes the connect hook; `kill` sends the close frame, detaches, and is idempotent; a chunk arriving after `kill` reaches nothing.
- **`src/acp/manager.test.ts`** — a tab with a `remote` target and an attached channel gets a remote-backed session and never calls `connectAcp`; a tab with a `remote` target whose channel is not yet attached gets the `ACP: the remote session is still connecting.` line and no busy state, transcript entry, or loop (the decision-7 guard, and the one an implementer is most likely to miss); a tab with a `remote` target but no channel at all falls back to the local path rather than throwing; a local tab is unchanged; the popup label stays `parseModel(ACP_MODEL)`'s value on both paths (the decision-4 guard against reintroducing the mode-name regression); a connection-level error closes the session so the next prompt builds a fresh one, while a prompt-level error leaves it open.
- **`src/acp/index.test.ts`** — `connectAcp` passes an explicit token map straight through to the sandbox options and falls back to the project's own when omitted; a child exit reports `ACP agent exited.` through `onError` exactly once; an exit following `kill()` reports nothing.
- **`src/capture/manager.test.ts`** — an `acp` command routed through the capture path for a remote tab reaches `AcpManager.run` unchanged, and a still-connecting remote tab answers the request with the refusal rather than hanging (decision 16).
- **`src/monitor/acp.test.ts`** — a monitor session whose agent exits now surfaces through its `onError`, pinning the decision-6 side effect on that path rather than leaving it to be discovered.
- **`src/connection/list.test.ts`, `src/connection/close.test.ts`** — no change expected; confirm the existing `acp:opencode` assertions still hold for a remote tab, which is the decision-4 guard.

## Out of scope

- `acp` in a **remote harness** tab (decision 15). Named in the spec as a follow-up rather than left unmentioned.
- Running the agent's `db`, `browser`, and `question` commands on the remote host (decision 10). They keep executing locally, against local files and a local browser.
- Any change to `runAcpToolLoop`, its step cap, its cold-start retry, its primers, or its command extractors.
- Monitor ACP sessions (`src/monitor/acp.ts`) and editor ACP personas (`src/editor/acp-manager.ts`, which builds on `spawnMonitorSession`) — both stay local regardless of any tab's remote target. They do pick up decision 6's exit reporting, which is a fix, not a feature.
- Queueing a prompt typed into a still-provisioning remote tab (decision 7). It is refused with a message the user can act on.
- Making the ACP agent or model configurable, on either machine. It stays the hardcoded `opencode acp` pair, per `product/specs/acp.md` § Hardcoded agent.
- Reconnect, resume, or reattach of an ACP session after a dropped channel — the tab closes, matching `product/specs/remote-server.md` § Lifecycle and cleanup.
- Multiple concurrent ACP sessions per remote tab, and multiplexing one remote agent across tabs.
- Preflighting `opencode` on the remote before the first prompt (decision 5).
- Restoring a remote agent tab's ACP session on `--relaunch`; remote agent tabs are already not restored at all.
- Any `web/src/` or `src/protocol.ts` change.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step — lints the changed files, typechecks incrementally, and runs the related server tests. Check the counted line totals for `src/remote/protocol.ts` and `src/remote/serve.ts` at their steps rather than at the end, since both are close to the limit.
- Manual check, needing a reachable ssh host that has `janus` and `opencode` on its PATH and both janissary installations on the same commit: launch `agent bekir on devbox`, wait for the tab to leave provisioning, then run `acp list the files in this directory and summarize what this project is`. Confirm the reply streams in as formatted Markdown, that it describes the *remote* workspace's files rather than this machine's, that the busy dot blinks while awaiting the agent, and that the tab's status popup shows `acp:opencode/gemini-3.1-flash-lite` — the configured model, not a mode name, which is the decision-4 check. Run a second `acp` prompt and confirm the conversation has context from the first, so the session was reused.
- Tool loop: ask something that makes the agent emit a `db` command and confirm the command entry and its result appear in the transcript and that the result reflects this machine's database, per decision 10.
- Still-connecting refusal: launch a remote agent on a host whose ssh authentication prompts (a passphrase, or 2FA) and type `acp hello` into the tab while the prompt is still showing. Confirm the single `ACP: the remote session is still connecting.` line, no busy dot, and that answering the ssh prompt and retrying then works.
- `acp reset` in that tab, then another prompt: confirm the reset message, that the new prompt has no memory of the earlier conversation, and — over ssh to the remote — that no orphaned `opencode` process is left behind.
- Failure paths: on a remote without `opencode` installed, confirm one `ACP:` line appears, the tab stays open, and a second `acp` prompt retries rather than reporting a stale session. Kill the remote `opencode` process by hand between two prompts and confirm the next prompt reports and then reconnects rather than hanging (the decision-6 check). With a prompt in flight, kill the ssh connection from the remote side and confirm the tab shows the `ACP:` error and then closes, with the remote's workspace clone removed.
- Inter-agent path: from another tab, `msg <remote-label> request <question>` and confirm the answer comes back from the remote agent, per decision 16.
- Version guard: point at a remote running an older janissary and confirm the launch is refused at the handshake with the message naming both versions, before any tab is provisioned.
