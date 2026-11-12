# Move janissary's ACP tool loop

**Complexity: 8/10** — ~1150 added lines across 25 edited files, 30 requirements spanning a protocol bump, both ACP loops, and a new tool (p=8.45)

A remote ACP tab runs its agent process on the remote host, but janissary's own tool loop — the primer, last-line command extraction, and `AcpTool` dispatch in `runCorePrompt` — used to run on the local host. The same was true of an autonomous `agent … on <host>` run, whose loop in `executeAgentRun` drove a remote session from the local machine. Any workspace-side tool therefore resolved against the wrong machine: a file read would read the local disk, not the workspace the agent is working in. This change moves the loop into the far-side ACP service for both kinds of run, so the remote server owns the primer it injects, the command it extracts from each reply, the gate that decides whether it may run, the workspace-side tools it runs, and the output it feeds back. Caller tools — `db`, `browser`, `question`, and every other janissary command an agent run may invoke — are sent back to the local host to run, and their output returns. A local tab and a local agent run use the same driver in-process, so local and remote runs share one loop implementation. The change also adds the first workspace-side tool, `file read`, folded in from the backlog's file read item, so the far-side execution path is real from day one. The goals are correctness for workspace-side tools on remote tabs, one loop code path for local and remote runs, and file reads that never pipe file contents to the local machine.

## Design decisions

From the feature text, existing behavior, and the user's answers:

1. **Both loops move.** The core loop (`ask`, `tell`, and a plugin's `promptAcp` on a remote tab) and the autonomous agent-run loop (`agent … on <host>`) run on the far side for a remote session. A local tab and a local agent run keep running the loop in-process, through the shared driver.
2. **Every tool has a side.** Each tool in the tool table declares whether it runs on the **caller** (the machine running janissary) or in the **workspace** (where the workspace lives). `db`, `browser`, and `question` are caller tools; `file read` is a workspace tool. For an agent run, every `janissary <command>` is a caller tool except `janissary file read …`, which is a workspace tool. On a local tab both sides are the same machine.
3. **Caller tools round-trip.** When a far-side loop extracts a caller-tool command, it sends it to the local side, which runs it exactly as today (the ordinary command dispatcher, the existing question panel and answer protocol, the local browser, the local `.janissary/db/sqlite/`) and returns the output. Database and browser files and windows stay where they are today, and keep appearing in the local connections panel.
4. **Local roles and settings are authoritative, snapshotted per prompt.** Each logical prompt reads its role and captures the effective native-command settings once, in `AcpManager.run` before the first model attempt. The captured `CommandSettingsSnapshot` is carried on the prompt's attempt record and reused by every model fallback for that prompt. `coreSnapshot` maps that captured value into the core `AcpRunSnapshot` for each attempt. The primer, the allow-list line, extraction, and the gate all use that snapshot for the whole prompt, on local and remote tabs alike. A settings change made mid-prompt takes effect from the next prompt, as does a change to a role's grants or name. This replaces today's per-call re-check of current settings in the loop.
5. **The dispatcher's own guard stays live.** A caller tool that is dispatched locally still passes through `dispatchNativeLine`'s general disabled-command guard, which reads current settings. So disabling a command mid-prompt still blocks the next run of it on the caller side; an agent-access change waits for the next prompt. A workspace command such as `file read` never passes the dispatcher, so the prompt's snapshot governs it for the rest of the prompt.
6. **Refusals keep their text.** The gate still returns `Command is disabled: <command>.` (checked first) and `Command not allowed for role "<role>": <subcommand>.` as normal tool results that consume one step. A disabled-command refusal still raises the local `command-disabled` notification, whichever side's gate produced it.
7. **Existing loop semantics are preserved**: the eight-step cap and its trailing `(stopped after 8 tool steps)` paragraph, unlimited steps for agent runs, one retry of a cold empty first reply in the same transcript entry, removal of the final command line from the displayed reply, the `acp: true` tool transcript entry, `tool` activity in the connection record, and a `withoutTools` tab building no tool table.
8. **Remote-run steps are tagged.** A tool step that executed on a remote host is shown with the prefix `[<host>] ` — on the `acp: true` transcript entry's input and on both of its `tool` activity lines in the connection record (the command and its result). `<host>` is the tab's `RemoteTarget.host`, or for an agent run its execution host. Caller-side steps, gate refusals, and every step on a local tab are untagged. Typed `file read` output is untagged too. A remote agent run's tool steps reach the connection record, not the run monitor's activity list.
9. **Cancellation stops the far loop.** `acp-cancel` aborts the far side's run signal, rejects and clears any pending caller-tool request, waits for the provider turn to drain, and then sends one `acp-run-end` with reason `cancelled`. A pending question resolves `Question cancelled.` locally through the prompt's own abort signal, as today, and a late caller-tool result is ignored. On the local side, `ask reset` or `tell reset` closes the session and aborts the run the same way; the prompt settles with `ACP session closed.` Close, dispose, and transport loss abort the run without sending a run-end.
10. **Transport loss aborts, as today.** If the channel drops mid-prompt, the far side aborts the loop and shuts down the session, and the local prompt settles with the existing transport-loss error. No loop survives the loss, and no loop event is replayed on reattach. The next `ask` or `tell` starts a fresh session.
11. **Protocol bump to 40.** One bump covers the loop frames and the new filesystem operation. A version-39 peer would otherwise accept prompts and run no loop at all — the "looks healthy while doing the wrong thing" failure the exact-version handshake refuses.

### `file read`

12. **Name and grammar.** `file read <path> [--offset <line>] [--limit <lines>]`. `file` is a new native tool owner; `file read` joins the native vocabulary after `question approve`. It is both an ACP tool and a command a user can type. The path is one whitespace-free token; quoting and paths containing spaces are not part of the grammar.
13. **Root.** On a remote tab, the remote workspace clone. On a local tab, the tab's `workspaceDir` when it has one, otherwise the janissary project directory. For an agent run, the run's execution directory on its execution host. Paths are relative to the root. A tab that has changed its shell directory still reads relative to its workspace.
14. **Containment and secrets.** The path must resolve, with symlinks followed, to a regular file inside the root. A path that is absolute, leaves the root lexically, or resolves outside it through a symlink is `Outside the workspace`. `.env` and `.env.*` files and any path containing a contiguous run from `SECRET_DENY_PATHS` (`.ssh`, `.aws`, `.netrc`, `.config/gh/hosts.yml`, shell history files, and the rest) are refused anywhere in the workspace, using the path as written before any disk access; the check runs again on the resolved path so a symlink cannot launder a secret name. The same table is also applied under the real home directory, in its literal and resolved forms, so a workspace opened at `~/.ssh`, `~/.config`, or `~/.local/share` cannot read `id_rsa`, `gh/hosts.yml`, or `opencode/auth.json`. A missing secret therefore still reports `Secret file` rather than revealing whether it exists.
15. **Limits.** Default and maximum `--limit` is 2000 lines; `--offset` is 1-based and defaults to 1. Lines longer than 2000 code points are cut and end with `…`. Files over 5 MB are refused.
16. **Output.** Numbered lines in `cat -n` style: the line number right-aligned to the width of the last line shown, a tab, then the text. A trailing carriage return is dropped before the length check and the cut. A capped result ends with `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`. An empty file prints `(empty file)`.
17. **Errors**, each exactly one line, with `<path>` as the caller gave it:
    - `File not found: <path>.` for a missing path, a dangling symlink, or a file that exists but cannot be read, such as one without read permission.
    - `Is a directory: <path>.`
    - `Not a text file: <path>.` for binary content, text that is not valid UTF-8, text containing a NUL byte, or anything that is not a regular file or directory, such as a named pipe, socket, or device.
    - `File too large (>5 MB): <path>.`
    - `Outside the workspace: <path>.`
    - `Secret file: <path>.`
    - `Offset past end of file (<total> lines): <path>.`
18. **Usage.** Bare `file`, `file read` with no path, an unknown `file` subcommand, a second path argument, a path starting with `--`, an unknown flag, a repeated flag, a non-positive or non-integer `--offset` or `--limit`, and a `--limit` above 2000 all print `Usage: file read <path> [--offset <line>] [--limit <lines>]`.
19. **Primer slice**, shown only when `file read` is granted:
    `To read a file in the workspace, end your reply with one line:`
    `file read <path> [--offset <line>] [--limit <lines>]`
    `Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.`
20. **Default grants.** A newly created roles file grants `file read` to `ask` and `tell`. Existing roles files are never rewritten. Other default roles keep no grants.
21. **Typed on a remote tab.** A typed `file read` reads the remote workspace through the `read-lines` filesystem operation and prints the numbered text with no `[<host>] ` tag. An absolute path is answered locally with `Outside the workspace: <typed>.` without sending a request. Reader errors name the path as typed even when the port normalized the spelling first; a far-side containment refusal prints `Outside the workspace: <typed>.`. If the channel is down or still connecting, it prints `Remote connection unavailable.` and never falls back to the local disk. A dropped connection or a read that times out prints the port's own line. File contents never cross to the local machine except as the formatted, capped result text.
22. **Agent runs.** A skill grant naming `file` permits `janissary file read …` in an agent run, like any other granted command. The agent gate decides only the side: a granted `file read` runs in the run's execution workspace, and an ungranted one returns `Agent: command not permitted: <command>.`. Every other extracted command is a caller command whose registry and grant checks stay in `runGrantedAgentCommand` on the local side. The agent snapshot carries no native-command settings, so the core disabled-setting rules do not apply to an agent run's `file read`.
23. **Tab completion.** `file <Tab>` offers `read`; after `file read`, a token starting with `--` offers `--offset` and `--limit`, and any other token completes a path against the same root the read uses. A remote tab offers no path candidates, and the value after either flag or any other `file` subcommand offers none.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `runAcpToolLoop` — the pure, dependency-injected loop (turns, retry, step cap, follow-up text, late-result drop) | `src/acp/loop.ts` |
| Cancellation discipline for one in-flight turn (admit, cancel, drain, release) | `AcpPromptControl` in `src/acp/prompt-control.ts` |
| Local ACP session and its lifecycle | `connectAcp` in `src/acp/index.ts` |
| Local adapter for a far-side ACP client | `createRemoteAcpSession` in `src/remote/acp-session.ts` |
| Far-side ACP holder, one session per id, bound to the workspace dir | `RemoteAcp` in `src/remote/serve-acp.ts` |
| Far-side frame dispatch and transport-loss entry point | `RemoteServer` in `src/remote/serve.ts` |
| Local ACP frame routing and unavailable-channel answers | `src/remote/channel/acp.ts`, `src/remote/channel/unavailable.ts` |
| ACP frame types, type registry, and validation | `src/remote/protocol-frames.ts`, `src/remote/frame/decode-acp.ts`, `src/remote/frame/decode-shared.ts` |
| Protocol version and its bump history | `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` |
| Remote filesystem operation table (descriptor per operation, validation, result decoding) | `src/remote/filesystem/operations.ts`, `operation-types.ts`, `result-decoders.ts`, `refusal.ts` |
| Local adapter for far-side filesystem sessions | `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts`, `port-requests.ts`, `port-paths.ts` |
| Root containment | `containedAbsolute`/`containedPath` in `src/path-containment.ts`; the far-side gate in `src/remote/filesystem/path-containment.ts` |
| Secret path names and the Seatbelt deny built from them | `SECRET_DENY_PATHS` in `src/sandbox/paths.ts`; `homeDParams` in `src/sandbox/harness-spawn.ts` |
| Connection-record tool activity | `coreActivity` in `src/acp/record-feed.ts`; `run.record?.activity('tool', …)` in `src/agent/execute.ts` |
| A per-tab remote channel, ready promise, and remote workspace root | `managers.remote.get`, `readyOf`, `workspaceOf` in `src/remote/manager.ts`; `resourceFor` in `src/plugins/remote-capabilities.ts` |
| An agent run's remote host | `remoteTarget.host` passed into `executeAgentRunSafely` in `src/agent/launch.ts` |
| Native vocabulary, owner mapping, and native rows | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`; `nativeCommandName`/`nativeCommandTool` in `src/acp/native-commands.ts`; `APPLICATION_COMMAND_NATIVE_TOOLS` in `src/shared/application-commands.ts`; native rows built in `src/application-commands.ts` |
| Default role grants | `DEFAULT_ROLES` in `src/plugins/roles/roles-file.ts` |
| Help pages that also generate the command reference docs | `help/*.md`, the table in `help/commands.md`, `documentation/user-documentation/command-reference/[command].paths.ts` |

## Proposed changes

### Tool catalog and gate — `src/acp/tool-table.ts`, rewritten in place

`tool-table.ts` is a pure module both hosts import, with no `Managers` dependency and no command-registry import. Its `AcpTool` type has `primer`, `match`, `isCommandLine`, and `runsOn: 'caller' | 'workspace'`. `createAcpToolTable(grants)` filters the fixed owner list by the granted native vocabulary; the order is browser, question, file, database, keeping database last as the fall-through. The database entry takes `DB_PRIMER` and `isDatabaseCommandLine` directly instead of a manager. `toolPrimer` and `toolExtractor` stay as they were. `gateCommand(snapshot, tools, command)` returns either `{ runsOn }` or `{ refusal, refused?: 'disabled' }`.

For a core snapshot, the gate throws `No ACP tool matched command: <command>` for a command no tool claims, refuses `Command is disabled: <native>.` with `refused: 'disabled'` when the row is disabled or agent-off, refuses `Command not allowed for role "<roleName>": <native>.` when the grant is missing, and otherwise returns the matched tool's `runsOn`. A missing settings row allows the command. For an agent snapshot the gate decides only the side: a trimmed command with one leading `/` dropped is tested with `isFileReadCommandLine`; `file read` with the `file` grant is `workspace`, without it is `Agent: command not permitted: <command>.`, and everything else is `caller`. The gate reads only the snapshot and is pure.

### Per-prompt snapshot — `AcpRunSnapshot` in `src/acp/types.ts`

`AcpRunSnapshot` is a discriminated union carried with each prompt:

- `core`: the role (`ask`/`tell`) and role name, the role's grants, the effective native rows (`name`, `effectiveEnabled`, `effectiveAgentAccess`) for the native vocabulary, and whether the tab is `withoutTools`.
- `agent`: the run's grants and whether the `ask-user` skill is selected. The agent primer needs no field: `executeAgentRun` already puts `agentPrimer(run.snapshot)` into the prompt text itself, and the loop's own primer for an agent run is `MARKDOWN_INSTRUCTION`, as today.

`AcpManager.run` reads `managers.nativeCommandSettings?.current()` once, after the refusal and empty-queue guard, and stores the result on the `Attempt` record. Every fallback is a spread of that record, so it inherits the same settings. `runCorePrompt` receives the captured value and `coreSnapshot` maps it into rows; a missing manager is represented as `undefined` and produces an empty row list. `executeAgentRun` builds the two-field `agent` snapshot inline. `withoutTools` stays a per-attempt read from the tab runtime. The snapshot is plain data so it can cross the wire.

### One loop driver — new `src/acp/drive-loop.ts`

`driveToolLoop(session, prompt, snapshot, host, events, signal)` wraps `runAcpToolLoop`. It builds the tool table (empty when a core snapshot is `withoutTools`), the primer, the extractor, and the step limit:

- For `core`, `corePrimer(snapshot, tools)` joins `toolPrimer`, `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE`, `TELL_INSTRUCTION` for the tell role, and `MARKDOWN_INSTRUCTION` in today's order. The extractor is `toolExtractor(tools)` and the cap is `CORE_MAX_STEPS` (8).
- For `agent`, the primer is `MARKDOWN_INSTRUCTION` alone, the extractor is `extractAgentCommand(text, snapshot.askUser)`, and the step limit is unlimited.

`TELL_INSTRUCTION` lives here. `extractAgentCommand` and its fence helpers live in a new pure `src/agent/command-extract.ts`, because `command-tools.ts` imports the command registry, which the far side must not load.

The runner gates each command, records the step's side and refusal flag, fires `startCommand(command, workspace)`, and then returns a refusal or calls `host.runWorkspace(command)` / `host.runCaller(command)`. A rejected host promise that arrives after the signal aborted resolves to an empty string so the loop discards it; an earlier rejection still becomes the `error` event. Events reuse `AcpLoopHandlers` with `ranCommand(command, result, workspace?, refused?)` and the new optional `startCommand`. `runToolLoop` is the one entry point: it sends a `RemoteAcpSession` to `session.run` (and does nothing if the signal is already aborted) and drives a local session in-process.

### Local side: one entry point for both session kinds

`runCorePrompt` builds the snapshot, calls `runToolLoop`, and keeps only what is local by nature: its caller and workspace runners, the `active()`-guarded session, and the transcript, notification, record, and settle handlers. `runCaller` is `dispatchNative` with the prompt signal; `runWorkspace` is `readFileInTab`. `startCommand` records the command (tagged when the step is a remote workspace step), `ranCommand` raises the `command-disabled` notification on a disabled refusal, records the result, and appends the `acp: true` entry; the entry's input is tagged and its output is raw. `finished` keeps the capped paragraph and settles the prompt.

`RemoteAcpSession` is `Omit<AcpSession, 'prompt'>` plus `run`, `ready`, `release`, and `remote: true`. Its `run(text, snapshot, runCaller, events)` admits the run through `AcpPromptControl` and sends `acp-run`. The run state and frame mapping live in `src/remote/acp-session-run.ts`: `acp-turn start` resets the accumulator and calls `startTurn`; `acp-chunk` appends a delta and emits the cumulative text; `acp-turn end` passes the authoritative display; `acp-tool-request` fires `startCommand`, awaits `runCaller`, fires `ranCommand`, and sends `acp-tool-result`, with an empty failure message sent as `Command failed.`; `acp-tool-step` fires both events; `acp-run-end` ends the control for every reason, so a cancelled run drains. Nothing is sent after cancel or release.

`executeAgentRun` makes the same switch. It builds the agent snapshot, routes caller commands through `runGrantedAgentCommand` (with the question status transition) and workspace commands through `readWorkspaceCommand(run.executionDir, …)`, and tags both `tool` activity lines with the execution host. `RemoteAgentTarget` carries `host`, filled from `remoteTarget.host` in `executeAgentRunSafely`.

### Wire protocol — `src/remote/protocol-frames.ts`, `src/remote/frame/decode-acp-run.ts`, `src/remote/frame/decode.ts`, `src/remote/channel/acp.ts`, `src/remote/channel/unavailable.ts`, `src/remote/protocol.ts`

Local → remote:

- `acp-run { id, text, snapshot }` replaces `acp-prompt`, which is deleted along with its decoder, its `RemoteServer` case, and its unavailable-channel case.
- `acp-tool-result { id, request, output }` or `{ id, request, error }` answers one tool request. Exactly one of `output` and `error` is present; a present empty output is a successful step, and an error is non-empty.

Remote → local:

- `acp-turn { id, phase: 'start', first }` and `{ id, phase: 'end', display }`.
- `acp-chunk` is unchanged: it carries a delta.
- `acp-tool-request { id, request, command }` asks the local side to run a caller tool. `request` is a per-run integer starting at 1. The local side records and displays the step itself, so the far side sends no `acp-tool-step` for it.
- `acp-tool-step { id, command, result, workspace, refused? }` reports a step the far side completed on its own: a workspace-tool run (`workspace: true`) or a gate refusal (`workspace: false`, with `refused: 'disabled'` for a disabled or agent-off refusal).
- `acp-run-end { id, reason }` with `reason` one of `answered`, `capped`, or `cancelled`. It is the run's terminal frame and replaces `acp-end`. No step count travels: only a core run can be capped, and both sides take 8 from `CORE_MAX_STEPS`. A non-fatal `acp-error` remains the run's other terminal, and a fatal one closes the session.

Every new frame and field is validated in `decode-acp-run.ts` before dispatch, including the snapshot's shape; decoded frames and rows are rebuilt from declared fields so unknown fields are dropped. The `acp-prompt` and `acp-end` cases leave `decode.ts`, and the type registries change to match. `unavailableSend` answers an `acp-run` on an unattached channel the way it answered `acp-prompt`, and drops an `acp-tool-result`. `REMOTE_PROTOCOL_VERSION` moves to 40 with a history paragraph naming the loop frames and `read-lines`.

### Far side — `src/remote/serve-acp.ts`, new `src/remote/serve-acp-loop.ts`, `src/remote/serve.ts`

`RemoteAcp.run(frame)` starts `startRemoteLoop` over the session's `AcpSession`, with the frame and `this.workspaceDir`, and keeps the returned handle on the live record. A missing or closed session gets the fatal `No remote ACP session is open.`; a second run gets the non-fatal `ACP: a prompt is already running.` The handle is cleared when the run's terminal frame is sent, including a non-fatal `acp-error`, so a finished run never leaves a stale guard. `toolResult` hands the frame to the live record's run. `cancel` calls the handle's `cancel`, which aborts, rejects and clears pending caller requests, awaits the provider turn, and sends one `acp-run-end cancelled`; a failed provider cancel clears the handle and sends the fatal `ACP: cancellation failed: …`. `close` and `dispose` abort the run without sending a run-end. `detachRuns` aborts and shuts down every session with a run, and every idle run-only session. A fatal connection error aborts the record's run after sending the fatal frame. `RemoteServer.dispatch` routes `acp-run` behind `requireWorkspace` and `acp-tool-result` straight to the holder.

`startRemoteLoop` maps the driver's host and events onto loop frames. Workspace tools run `readWorkspaceCommand` against the far-side workspace directory, trimming whitespace and one leading `/` so `janissary /file read …` works. Caller tools send `acp-tool-request` and await the matching `acp-tool-result`. Every frame-producing callback is guarded on the run signal, including `acp-chunk` forwarding, so nothing escapes after an abort; the deliberate terminal frame from `cancel` is the one exception. A per-run `forwarded` flag distinguishes a caller step from a far-side step so a request does not also produce an `acp-tool-step`. The module imports no `Managers`, command registry, or `serve-acp.ts`.

### File read — new `src/file-read/`

- `command.ts`: `FileReadArgs`, `FILE_READ_MAX_LIMIT` (2000), `FILE_READ_USAGE`, `parseFileRead`, `FILE_READ_PRIMER`, and `isFileReadCommandLine`, mirroring `src/browser/command.ts`. The parser is pure and splits on whitespace; it accepts one path token and the two flags in either order, rejects duplicates, unknown flags, a second path, and non-positive or non-integer values, and fills the defaults.
- `format.ts`: `FILE_READ_MAX_LINE_LENGTH` (2000) and `formatFileLines(text, args)`. It splits on `\n`, removes one trailing `\r` per line, windows the requested lines, right-aligns line numbers to the last number shown, cuts lines over 2000 code points with `…`, prints `(empty file)`, and appends the continuation notice or the offset error.
- `read.ts`: `FILE_READ_MAX_BYTES` (5 MB), `readWorkspaceLines(root, args)`, and `readWorkspaceCommand(root, input)`. It performs lexical containment, the root-relative secret check, the home-anchored secret check, then realpath containment, the resolved secret checks, a single `statSync` for type and size, and a UTF-8 fatal decode with a NUL check. `resolveExisting` resolves a path or its deepest existing ancestor so the home rule can refuse a missing secret before any file access. `isSecretPath` matches `.env`/`.env.*` and contiguous `SECRET_DENY_PATHS` runs case-insensitively; `isUnderHomeSecret` mirrors the Seatbelt deny at `<real home>/<entry>` in literal and resolved forms. Any filesystem failure becomes `File not found`, and every error names the path as given.

### Typed `file` command — new `src/commands/file.ts`, registry, `src/file-read/tab-read.ts`

A `Command` named `file` lives in `src/commands/file.ts`, listed in `coreCommands` before `files`, with `parseFileRead` doing all argument handling and `appendCommandOutput` printing the result. `BUILTIN_FORMS` gains `file: { name: 'file', forms: ['file'] }`, so the commands tab lists and disables it and the native `file read` row hangs under it.

`src/file-read/tab-read.ts` holds the local-or-remote decision shared by the typed command and the core loop's workspace runner. `localReadRoot(managers, label)` returns `undefined` for a tab with `remote`, else the tab's `workspaceDir` or `managers.tab.launchDir`. `readFileInTab` parses first, reads locally through `readWorkspaceLines`, or reads remotely through a `RemoteFileSystemPort` with its own `file-read-<n>` session id, disposed in a `finally`. The remote branch answers an absolute path locally, rewrites a reader error's normalized suffix back to the typed spelling, maps `OUTSIDE_ROOT_REASON` to `Outside the workspace: <typed>.`, passes `Remote connection unavailable.` through, and prints any other rejection's message as one line. It never rejects and never falls back to the local disk.

`src/completion/file-read.ts` completes the subcommand, the two flags, and paths against `localReadRoot`; `completeCommandLine` gains a trailing `fileReadRoot` parameter, and `src/controller/completion.ts` supplies it. A remote tab therefore offers no path candidates.

### Remote filesystem operation — `src/remote/filesystem/operations.ts`, `src/remote/protocol-frames.ts`, `src/file-navigator/remote/port.ts`

A read-only `read-lines` operation with `path`, optional `offset`, and optional `limit`, modeled on `read-file`: a validator for the two positive integers with `limit` capped at `FILE_READ_MAX_LIMIT`, a decode that keeps absent keys absent, `paths` extraction with `rootDestination: true`, and a result decoder for `{ text }`. Its `run` calls `readWorkspaceLines(context.root, …)` with the parser's defaults, so every reader outcome is a successful reply. The far-side containment gate still runs first and answers an escaping path with `OUTSIDE_ROOT_REASON`.

`RemoteFileSystemPort.readLines(root, relPath, offset?, limit?)` lives on the remote port only. `remoteReadLines` in `src/file-navigator/remote/port-reads.ts` answers an absolute path locally, maps the relative path with `this.paths.to`, sends only defined `offset`/`limit` keys, and returns `{ text, path }`. It keeps the ordinary request deadline. The operation is covered by the version 40 bump.

### Vocabulary and roles

- `NATIVE_ACP_COMMANDS` gains `file read` after `question approve`.
- `APPLICATION_COMMAND_NATIVE_TOOLS` gains `file`, and `nativeCommandTool` maps `file …` to it before the question fall-through.
- The default `ask` and `tell` roles grant `file read`; existing roles files are never rewritten.
- The commands tab and roles tab list `file read` automatically from the vocabulary; no web change is needed.

### Specs and docs

- `product/specs/acp.md`: the prompt-scoped snapshot and live dispatcher guard, caller/workspace tool sides, the `### File read` section (root, containment, secrets, output, errors, primer, grants), host tags, and the far-side loop under remote connections.
- `product/specs/remote-server.md`: the three-way split, the agent-run paragraph, the version 40 paragraph, the unavailable-send behavior, and the out-of-scope bullet.
- `product/specs/roles.md`: the default `ask`/`tell` grants and the count of native commands.
- `product/specs/agent-command.md`: local and remote `file read`, the tag on both record lines, and that the monitor does not receive the step.
- `product/specs/application-commands.md`: the prompt-scoped snapshot rule and the dispatcher's live guard.
- `product/specs/tab-completion.md`: `file read` completion against the read root.
- `help/file.md` (new), a `file` row in `help/commands.md`, and the `file read` grant in `help/ask.md`, `help/tell.md`, and `help/roles.md`.
- `documentation/user-documentation/advanced-agents/acp-agent.md`, `agent-command.md`, `remote-agents.md`, and `tab-types/roles.md`: where `file read` runs, the caller-side tools, and the host tag.

### Implementation order

The whole plan ships as one pull request. Within it, each step leaves typecheck and tests green:

1. The `file read` parser, formatter, reader, remote `read-lines` operation, typed `file` command, help page, tab completion, native vocabulary, and default grants.
2. The pure tool table and gate, the snapshot type, and the shared driver.
3. `runCorePrompt` and `executeAgentRun` switched to the driver for local sessions, with the prompt-scoped settings capture in `AcpManager.run`.
4. Protocol 40 and the loop frames: the frame swap, the far-side loop, `RemoteAcpSession.run`, the session type split, and the remote agent-run path.
5. `[<host>] ` tags on remote workspace steps.
6. Specs, help, and user docs.
7. The end-to-end verification pass.

## Tests

Colocated vitest files, following each area's existing tests:

- `src/acp/tool-table.test.ts` — table order, granted-owner filtering, sides, primer and allow-list text, extraction including `file read`; for `gateCommand`, refusal order and text, disabled before not-allowed, the `refused` flag, agent-kind rules, snapshot use rather than live settings, and a frozen-snapshot purity case.
- `src/acp/drive-loop.test.ts` — core primer order and allow-list, caller and workspace routing, event order, step cap and capped paragraph, agent kind with its own primer and unlimited steps, cancellation with a late result or rejection, and the remote branch of `runToolLoop`.
- `src/acp/run-prompt.test.ts` — the local path's transcript entries, records, notifications, and settled replies; the prompt-scoped settings rule; the dispatcher's live guard; a remote tab's workspace read staying on the far side; `[<host>] ` tags on the transcript and both record lines but not caller or refused steps; and remote cancellation.
- `src/acp/manager.test.ts` — one settings read for a logical prompt across a model fallback, a fresh read for the next prompt, and remote sessions driven through `acp-run`.
- `src/acp/guard-handlers.test.ts` and `src/acp/ask-role.test.ts` — the new event arguments and the `Attempt` snapshot field.
- `src/file-read/command.test.ts`, `format.test.ts`, `read.test.ts`, and `tab-read.test.ts` — every usage form; defaults and bounds; line numbering, CRLF handling at the cut boundary, long-line cuts, empty files, and the continuation notice; containment, symlinks, root-relative and home-anchored secrets before disk access, permission failures, non-regular files, invalid UTF-8 and NUL, the 5 MB cap, every error line; and the local/remote root rule.
- `src/commands/file.test.ts` — local and remote reads, the path-as-typed rewrite, `Outside the workspace`, the unavailable and ended lines, untagged output, and port disposal.
- `src/completion/file-read.test.ts` and `src/completion/index.test.ts` — subcommand, flag, and workspace-root path completion, and no remote path candidates.
- `src/remote/serve-acp-loop.test.ts` — workspace runs and reports, caller requests and results, empty outputs, snapshot refusals, event order, the capped run, cancellation, abort, and unknown or late results.
- `src/remote/serve-acp.test.ts`, `acp-session.test.ts`, and `channel/index.test.ts` — run admission, turn and tool frame mapping, the empty-error fallback, run-end settlement, cancellation, close, dispose, transport loss, and listener routing.
- `src/remote/protocol.test.ts`, `decode-acp-run.test.ts`, `filesystem/operations.test.ts`, `serve-file-navigator.test.ts`, `serve.test.ts`, and `port.test.ts` — every new frame round trip and malformed case, the version 40 inventory, `read-lines` validation and results, and the port method.
- `src/agent/execute.test.ts`, `command-extract.test.ts`, and `command-tools.test.ts` — agent-snapshot runs, workspace reads, caller-command round trips, target `host`, tags, and the moved extractor.
- `src/application-commands.test.ts`, `native-commands.test.ts`, `policy.test.ts`, `plugins/roles/*.test.ts`, and `web/src/shared/command-availability.parity.test.ts` — the `file` and `file read` rows, their settings behavior, the ten-command vocabulary, the default grants, and client/server agreement.

## Out of scope

- Running `db`, `browser`, or `question` on the remote host; they stay caller tools.
- Showing a remote host's databases or browsers in the local connections panel or sql tab.
- File write and file edit tools (a separate backlog item; they plug in as further workspace tools).
- Keeping a far-side loop running across a transport loss, or replaying loop events on reattach.
- Changing monitors, conversations, and editor persona ACP consumers, which do not enter the tool loop.
- Showing far-side tool steps in the run monitor; they are recorded only in the connection record.
- Tagging typed `file read` output, caller-side steps, or gate refusals with a host.
- Remote path completion for `file read`, quoted paths, or paths containing whitespace.
- Streaming file reads or closing the stat-to-read race.

## Verification

- `$janissary/scripts/run.mjs check-diff` during development, then the focused suite from the end-to-end pass: `npm run typecheck:diff`, the server tests for `src/acp src/agent src/file-read src/commands src/remote src/file-navigator/remote src/plugins/roles src/completion src/native-commands src/application-commands.test.ts src/monitor src/conversations src/personas.test.ts`, and the client parity test `web/src/shared/command-availability.parity.test.ts`.
- `npm run docs:build` for the new help page and the generated command reference.
- Static inventory: `REMOTE_PROTOCOL_VERSION` is 40; the client frame registry carries `acp-run` and `acp-tool-result`, the server registry carries `acp-turn`, `acp-tool-request`, `acp-tool-step`, and `acp-run-end`, and neither carries `acp-prompt` or `acp-end`; `NATIVE_ACP_COMMANDS` ends with `file read`; only `ask` and `tell` grant it by default.
- Local manual checks: on a local tab, `file read .env` prints `Secret file: .env.`, `file read ../x` prints `Outside the workspace: ../x.`, `file read README.md --limit 3` prints numbered lines and the continuation notice, `file read` prints the usage line, and `help file` shows the new page.
- Remote-host matrix, deferred until a second machine running this branch is available: on a remote shell tab whose clone has a file the local checkout lacks, `tell read notes/remote-only.md and summarize it` shows a tagged `[<host>] file read …` step and a correct summary; typed `file read notes/remote-only.md --limit 3` prints numbered lines untagged; `tell create a sqlite database named probe` creates `probe.sqlite` under the **local** `.janissary/db/sqlite/` with an untagged step; an `ask` that emits `question ask …` shows the question panel locally; `tell reset` mid-run settles at once with no further step; an `agent on <host>` run reads its remote workspace and tags both record lines; and a dropped connection settles the prompt with the existing transport-loss error and replays no loop event. The local checks and focused suite passed at the verified head; the remote-host rows are deferred because no second machine was available, and a unit test covering the same path does not turn a deferred row into a pass.
