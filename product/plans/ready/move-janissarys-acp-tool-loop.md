# Move janissary's ACP tool loop

**Complexity: 8/10** — ~1150 added lines across 25 edited files, 30 requirements spanning a protocol bump, both ACP loops, and a new tool (p=8.45)

A remote ACP tab runs its agent process on the remote host, but janissary's own tool loop — the primer, last-line command extraction, and `AcpTool` dispatch in `runCorePrompt` — still runs on the local host. The same is true of an autonomous `agent … on <host>` run, whose loop in `executeAgentRun` drives a remote session from the local machine. Any host-side tool therefore resolves against the wrong machine: a file read would read the local disk, not the workspace the agent is working in. This change moves the loop into the far-side ACP service for both kinds of run, so the remote server owns the primer it injects, the command it extracts from each reply, the gate that decides whether it may run, the workspace-side tools it runs, and the output it feeds back. Tools that belong to the caller — `db`, `browser`, `question`, and every other janissary command an agent run may invoke — are sent back to the local host to run and their output returned. The change also adds the first workspace-side tool, `file read`, folded in from the backlog's file read item, so the far-side execution path is real from day one. The goals are correctness for workspace-side tools on remote tabs, one loop code path for local and remote runs, and file reads that never pipe file contents to the local machine.

## Design decisions

From the feature text, existing behavior, and the user's answers:

1. **Both loops move.** The core loop (`ask`, `tell`, and a plugin's `promptAcp` on a remote tab) and the autonomous agent-run loop (`agent … on <host>`) run on the far side for a remote session. A local tab and a local agent run keep running the loop in-process, through the same shared code.
2. **Every tool has a side.** Each tool in the tool table declares whether it runs on the **caller** (the machine running janissary) or in the **workspace** (where the workspace lives). `db`, `browser`, and `question` are caller tools; `file read` is a workspace tool. For an agent run, every `janissary <command>` is a caller tool except `janissary file read …`, which is a workspace tool. On a local tab both sides are the same machine.
3. **Caller tools round-trip.** When a far-side loop extracts a caller-tool command, it sends it to the local side, which runs it exactly as today (the ordinary command dispatcher, the existing question panel and answer protocol, the local browser, the local `.janissary/db/sqlite/`) and returns the output. Database and browser files and windows stay where they are today, and keep appearing in the local connections panel.
4. **Local roles and settings are authoritative, snapshotted per prompt.** For each logical prompt the local side reads the role's grants (as today) and snapshots the effective native-command settings, and the snapshot travels with the prompt. The primer, the allow-list line, extraction, and the gate all use that snapshot for the whole prompt, on local and remote tabs alike. A settings change made mid-prompt takes effect from the next prompt. This replaces today's per-call re-check of current settings in the loop.
5. **The dispatcher's own guard stays.** A caller tool that is dispatched locally still passes through `dispatchNativeLine`'s general disabled-command guard, which reads current settings. So disabling a command mid-prompt still blocks the next run of it on the caller side; an agent-access change waits for the next prompt.
6. **Refusals keep their text.** The gate still returns `Command is disabled: <command>.` (checked first) and `Command not allowed for role "<role>": <subcommand>.` as normal tool results that consume one step. A disabled-command refusal still raises the local `command-disabled` notification, whichever side's gate produced it.
7. **Existing loop semantics are preserved**: the eight-step cap and its trailing `(stopped after 8 tool steps)` paragraph, unlimited steps for agent runs, one retry of a cold empty first reply in the same transcript entry, removal of the final command line from the displayed reply, the `acp: true` tool transcript entry, `tool` activity in the connection record, and a `withoutTools` tab building no tool table.
8. **Remote-run steps are tagged.** A tool step that executed on a remote host is shown with the prefix `[<host>] ` — on the `acp: true` transcript entry's input and on both of its `tool` activity lines in the connection record (the command and its result). `<host>` is the tab's `RemoteTarget.host`, or for an agent run its execution host. Caller-side steps, and every step on a local tab, are untagged.
9. **Cancellation aborts the far loop.** `acp-cancel` stops the far side's loop as well as any in-flight provider turn. A caller-tool request still pending is abandoned: the local side aborts its own work (a pending question resolves `Question cancelled.`, as today), and the far side ignores a late result. The local prompt settles exactly as it does now.
10. **Transport loss aborts, as today.** If the channel drops mid-prompt, the far side cancels the loop and closes the session, and the local prompt settles with the existing transport-loss error. The next `ask` or `tell` starts a fresh session.
11. **Protocol bump to 40.** One bump covers the loop frames and the new filesystem operation. A version-39 peer would otherwise accept prompts and run no loop at all — the "looks healthy while doing the wrong thing" failure the exact-version handshake refuses.

### `file read`

12. **Name and grammar.** `file read <path> [--offset <line>] [--limit <lines>]`. `file` is a new native tool owner; `file read` joins the native vocabulary after `question approve`. It is both an ACP tool and a command a user can type.
13. **Root.** On a remote tab, the remote workspace clone. On a local tab, the tab's `workspaceDir` when it has one, otherwise the janissary project directory. For an agent run, the run's execution directory on its execution host. Paths are relative to the root.
14. **Containment and secrets.** The path must resolve, with symlinks followed, to a regular file inside the root. Files named `.env` or `.env.*`, and any path with a segment matching a name in the sandbox's `SECRET_DENY_PATHS` (`.ssh`, `.aws`, `.netrc`, and the rest), are refused anywhere in the workspace.
15. **Limits.** Default and maximum `--limit` is 2000 lines; `--offset` is 1-based and defaults to 1. Lines longer than 2000 characters are cut and end with `…`. Files over 5 MB are refused.
16. **Output.** Numbered lines in `cat -n` style: the line number right-aligned, a tab, then the text. A capped result ends with `(showing lines <first>-<last> of <total>; continue with --offset <last+1>)`. An empty file prints `(empty file)`.
17. **Errors**, each exactly one line, with `<path>` as the caller gave it:
    - `File not found: <path>.`
    - `Is a directory: <path>.`
    - `Not a text file: <path>.` (binary or not valid UTF-8)
    - `File too large (>5 MB): <path>.`
    - `Outside the workspace: <path>.`
    - `Secret file: <path>.`
    - `Offset past end of file (<total> lines): <path>.`
18. **Usage.** Bare `file`, `file read` with no path, an unknown `file` subcommand, a non-positive or non-integer `--offset` or `--limit`, and a `--limit` above 2000 all print `Usage: file read <path> [--offset <line>] [--limit <lines>]`.
19. **Primer slice**, shown only when `file read` is granted:
    `To read a file in the workspace, end your reply with one line:`
    `file read <path> [--offset <line>] [--limit <lines>]`
    `Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.`
20. **Default grants.** A newly created roles file grants `file read` to `ask` and `tell`. Existing roles files are never rewritten. Other default roles keep no grants.
21. **Typed on a remote tab.** A typed `file read` reads the remote workspace through the far side and prints the numbered text with no `[<host>] ` tag. If the channel is down or still connecting, it prints `Remote connection unavailable.` and never falls back to the local disk. File contents never cross to the local machine except as the formatted, capped result text.
22. **Agent runs.** A skill grant naming `file` permits `janissary file read …` in an agent run, like any other granted command.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `runAcpToolLoop` — the pure, dependency-injected loop (turns, retry, step cap, follow-up text) | `src/acp/loop.ts` |
| `runCorePrompt` — builds the tool table, primer, gated runner, extractor, and transcript handlers for a core prompt | `src/acp/run-prompt.ts` |
| `AcpTool` table, `toolPrimer`, `toolRunner` (settings + grant gate), `toolExtractor`, `dispatchNative` | `src/acp/tool-table.ts` |
| Agent-run loop, primer, `janissary <command>` extractor, and granted-command runner | `executeAgentRun` in `src/agent/execute.ts`; `agentPrimer`, `extractAgentCommand`, `runGrantedAgentCommand` in `src/agent/command-tools.ts` |
| Native vocabulary, owner mapping, native rows | `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`; `nativeCommandName`/`nativeCommandTool` in `src/acp/native-commands.ts`; `APPLICATION_COMMAND_NATIVE_TOOLS` in `src/shared/application-commands.ts`; native rows built in `src/application-commands.ts` |
| Default role grants | `src/plugins/roles/roles-file.ts` |
| Effective settings (pure over a `CommandSettingsSnapshot`) and the disabled-command refusal | `effectiveCommandSetting` in `src/native-commands/policy.ts`; `refuseDisabledCommand` in `src/native-commands/dispatch-policy.ts` |
| The dispatcher's general disabled-command guard | `CommandManager.dispatchLine` in `src/command/manager.ts` |
| Primer lines | `NO_BUILTIN_TOOLS_LINE`/`NO_TOOLS_LINE` in `src/acp/internal-tools.ts`, `MARKDOWN_INSTRUCTION` in `src/acp/launch.ts`, `TELL_INSTRUCTION` in `src/acp/run-prompt.ts`, `DB_PRIMER` in `src/database/primer.ts`, `BROWSER_PRIMER` in `src/browser/command.ts`, `QUESTION_PRIMER` in `src/question-command.ts` |
| Cancellation discipline for one in-flight turn (admit, cancel, drain, release) | `AcpPromptControl` in `src/acp/prompt-control.ts` |
| Local adapter for a far-side ACP client | `createRemoteAcpSession` in `src/remote/acp-session.ts` |
| Far-side ACP holder, one session per id, bound to the workspace dir | `RemoteAcp` in `src/remote/serve-acp.ts` |
| Far-side frame dispatch | `RemoteServer` in `src/remote/serve.ts` |
| Local ACP frame routing and unavailable-channel answers | `src/remote/channel/acp.ts`, `src/remote/channel/unavailable.ts` |
| ACP frame types, type registry, and validation | `src/remote/protocol-frames.ts`, `src/remote/frame/decode-acp.ts` |
| Protocol version and its bump history | `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` |
| Remote filesystem operation table (descriptor per operation, validation, result decoding) | `src/remote/filesystem/operations.ts` |
| Local adapter for far-side filesystem sessions | `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts` |
| Root containment | `containedPath` in `src/path-containment.ts`; its use in `LocalFileSystemPort.readFile` in `src/file-navigator/filesystem-port.ts` |
| Secret path names | `SECRET_DENY_PATHS` in `src/sandbox/paths.ts` |
| Connection-record tool activity | `coreActivity` in `src/acp/record-feed.ts`; `run.record?.activity('tool', …)` in `src/agent/execute.ts` |
| A per-tab `RemoteFileSystemPort` opened from a tab's channel, ready promise, and remote workspace root | `resourceFor` in `src/plugins/remote-capabilities.ts` (`managers.remote.get`, `readyOf`, `workspaceOf`) |
| An agent run's remote host | `remoteTarget.host` passed into `executeAgentRunSafely` in `src/agent/launch.ts` |
| Help pages that also generate the command reference docs | `help/*.md`, the table in `help/commands.md`, `documentation/user-documentation/command-reference/[command].paths.ts` |

## Proposed changes

### Tool catalog and gate — `src/acp/tool-table.ts`, rewritten in place

`tool-table.ts` becomes a pure module both hosts import, with no `Managers` dependency. Its `AcpTool` type drops `run` and gains `runsOn: 'caller' | 'workspace'`, keeping `primer`, `match`, and `isCommandLine`; the owner list keeps its current shape with `file` added. The order is browser, question, file, database, keeping database last as the fall-through. `createAcpToolTable(grants)` keeps its owner filtering but no longer takes `managers` or a signal; the database primer comes from `DB_PRIMER` directly instead of `managers.database.primer`. `toolPrimer` and `toolExtractor` stay as they are. `dispatchNative` moves into `run-prompt.ts`, its only caller, because it needs `Managers`.

### Per-prompt snapshot — `AcpRunSnapshot` in `src/acp/types.ts`

`AcpRunSnapshot` is a discriminated union carried with each prompt:

- `core`: the role (`ask`/`tell`) and role name, the role's grants, the effective native rows (`name`, `effectiveEnabled`, `effectiveAgentAccess`) for the native vocabulary taken from the current `CommandSettingsSnapshot`, and whether the tab is `withoutTools`.
- `agent`: the run's grants and whether the `ask-user` skill is selected. The agent primer needs no field: `executeAgentRun` already puts `agentPrimer(run.snapshot)` into the prompt text itself, and the loop's own primer for an agent run is just `MARKDOWN_INSTRUCTION`, as today.

`runCorePrompt` builds the `core` snapshot in a few lines from `request` and `managers.nativeCommandSettings?.current()`; a missing settings manager gives an empty row list. `executeAgentRun` builds the two-field `agent` snapshot inline. Neither needs a module of its own. The snapshot is plain data so it can cross the wire.

### Gate — `gateCommand` in `src/acp/tool-table.ts`

`gateCommand(snapshot, tools, command)` is pure and replaces `toolRunner` in the same file. It returns either the spec to run, or a refusal carrying its text and, for a disabled or agent-off refusal, `refused: 'disabled'`. For the `core` kind its order is today's `toolRunner` order (`src/acp/tool-table.ts`, `export function toolRunner`): an unknown native name or unmatched tool throws `No ACP tool matched command: <command>`; a command whose snapshot row has `effectiveEnabled` false, or `effectiveAgentAccess` false, refuses with `Command is disabled: <command>.`; an ungranted command refuses with `Command not allowed for role "<role>": <subcommand>.`. A native command with no snapshot row is allowed, matching today's "missing settings manager or setting row allows the command". The gate reads rows by native name straight from the snapshot — a native row's name is its fixed form (`src/application-commands.ts`, `rows.push({ name, kind: 'native', …`) — so it imports neither `src/native-commands/policy.ts` nor `src/application-commands.ts`, which would drag the command registry into the far side.

For the `agent` kind the gate decides only the side. `file read` is the one workspace command: the gate refuses it with today's `Agent: command not permitted: <command>.` when the grants lack `file`, and otherwise runs it in the workspace. Every other extracted command is a caller command whose permission check stays where it is today, inside `runGrantedAgentCommand` on the local side.

### One loop driver — new `src/acp/drive-loop.ts`

`driveToolLoop(session, prompt, snapshot, host, events, signal)` wraps `runAcpToolLoop`. It builds the primer: for `core`, `toolPrimer` over the granted tools (their slices and the allow-list line), then `NO_BUILTIN_TOOLS_LINE` or `NO_TOOLS_LINE`, then `TELL_INSTRUCTION` for the tell role, then `MARKDOWN_INSTRUCTION`, in today's order from `runCorePrompt`; for `agent`, `MARKDOWN_INSTRUCTION` alone. `TELL_INSTRUCTION` moves out of `run-prompt.ts` into this module. A `withoutTools` snapshot builds an empty tool table. The driver picks the extractor (`toolExtractor`, or `extractAgentCommand` with the snapshot's ask-user flag) and sets `maxSteps` (8 for `core`, unlimited for `agent`). `extractAgentCommand` and its fence helpers move from `src/agent/command-tools.ts` to a new pure `src/agent/command-extract.ts`, because `command-tools.ts` imports the command registry, which the far side must not load.

The runner gates each command. A refusal is reported as one completed step. Otherwise it calls `host.runWorkspace(command)` or `host.runCaller(command)` by the tool's side. Events reuse the existing `AcpLoopHandlers` in `src/acp/types.ts` (`startTurn`, `chunk`, `endTurn`, `ranCommand`, `finished`, `error`) and its `guardAcpHandlers` wrapper, with two changes: `ranCommand` gains `workspace` and optional `refused` arguments, and a new `startCommand(command, workspace)` fires before a command runs, as `runCorePrompt`'s `recordTool(command)` does today while a question is pending.

Both hosts call it:

- **Local, in-process.** `runCorePrompt` and `executeAgentRun` call it over a local `AcpSession`. `runCaller` is today's `dispatchNative` (core) or `runGrantedAgentCommand` (agent); `runWorkspace` is the file read module against the local root.
- **Far side.** `RemoteAcp` calls it over its own `connectAcp` session. `runWorkspace` is the file read module against its workspace dir; `runCaller` sends `acp-tool-request` and awaits the matching `acp-tool-result`.

### Local side: one entry point for both session kinds

`src/acp/run-prompt.ts` stops calling `runAcpToolLoop` directly. It builds the snapshot and calls `runToolLoop(session, prompt, snapshot, host, events, signal)`, a new function in `drive-loop.ts`. For a local `AcpSession` that calls `driveToolLoop` in-process. For a `RemoteAcpSession` it calls the session's `run`, passing `host.runCaller` so tool requests from the far side run locally. The two session kinds are told apart by a `remote: true` discriminant on `RemoteAcpSession`.

`RemoteAcpSession` becomes `Omit<AcpSession, 'prompt'>` plus `run`, `ready`, `release`, and `remote: true`; no new lifecycle type is needed. The holder in `src/acp/session-manager.ts` stores `AcpSession | RemoteAcpSession`. Every use of `holder.session` there and in `src/acp/manager.ts` only calls `cancel`, `kill`, or `shutdown`, except the one hand-off to `runCorePrompt`, which accepts the union.

The handlers are today's transcript, notification, record, and settle calls, moved unchanged. `startCommand` calls `recordTool(command)`. `ranCommand` calls `recordTool(result)` and appends the `acp: true` entry, as it does today. A workspace step on a remote tab prefixes `[<tab.remote.host>] ` to the command in both the record and the transcript entry input. A `refused: 'disabled'` step calls `notify(managers, 'command-disabled', label, result)`, the same notification `toolRunner` raises today. `executeAgentRun` in `src/agent/execute.ts` makes the same switch. `RemoteAgentTarget` gains `host`, filled from `remoteTarget.host` in `executeAgentRunSafely` (`src/agent/launch.ts`), and remote-run steps are tagged with it in `run.record?.activity('tool', …)`.

`RemoteAcpSession` (`src/remote/acp-session.ts`) replaces `prompt` with `run(text, snapshot, runCaller, events)`. It sends `acp-run` and admits the run through `AcpPromptControl`, so `cancel` sends `acp-cancel` and drains on the run's terminal frame, as one provider turn does today. It routes the loop frames to the events. `acp-chunk` deltas accumulate per turn into the cumulative text the chunk event expects, and reset on each turn start. It answers each `acp-tool-request` by calling `startCommand`, awaiting `runCaller(command)`, calling `ranCommand`, and sending `acp-tool-result`. An `acp-tool-step` calls `startCommand` and `ranCommand` together. A rejected `runCaller` sends the error variant. It sends nothing once the run is cancelled or the session is released. The run handling moves to a new `src/remote/acp-session-run.ts`, so `acp-session.ts`, now 172 lines, stays under the limit. `AcpSessionListener` in `src/remote/channel/acp.ts` replaces `onEnd` with handlers for the new frames.

### Wire protocol — `src/remote/protocol-frames.ts`, `src/remote/frame/decode-acp.ts`, `src/remote/channel/acp.ts`, `src/remote/channel/unavailable.ts`, `src/remote/protocol.ts`

Local → remote:

- `acp-run { id, text, snapshot }` replaces `acp-prompt`, which is deleted along with its decoder, its `RemoteServer` case, and its unavailable-channel case.
- `acp-tool-result { id, request, output }` or `{ id, request, error }` answers one tool request.

Remote → local:

- `acp-turn { id, phase: 'start', first }` and `{ id, phase: 'end', display }`.
- `acp-chunk` is unchanged: it carries a delta.
- `acp-tool-request { id, request, command }` asks the local side to run a caller tool. `request` is a per-session integer the far side assigns. The local side records and displays the step itself, so the far side sends no `acp-tool-step` for it.
- `acp-tool-step { id, command, result, workspace, refused? }` reports a step the far side completed on its own: a workspace-tool run (`workspace: true`) or a gate refusal (`workspace: false`, with `refused: 'disabled'` for a disabled or agent-off refusal).
- `acp-run-end { id, reason }` with `reason` one of `answered`, `capped`, or `cancelled`. No step count travels: only a `core` run can be capped, and its cap is the fixed 8 that both sides take from `drive-loop.ts`. It is the run's terminal frame and replaces `acp-end`. A non-fatal `acp-error` remains the run's other terminal, and a fatal one still closes the session.

Every new frame and field is validated in `decode-acp.ts` before dispatch, including the snapshot's shape, in the style of the existing `decodeAcpEnd`. The `acp-prompt` and `acp-end` cases leave `src/remote/frame/decode.ts`, and the type registries `CLIENT_FRAME_TYPES` and `SERVER_FRAME_TYPES` in `protocol-frames.ts` change to match. `src/remote/channel/unavailable.ts` answers an `acp-run` on an unattached channel the way it answers `acp-prompt` today, and drops an `acp-tool-result`. `REMOTE_PROTOCOL_VERSION` moves to 40, with a history paragraph in the same style as its predecessors.

### Far side — `src/remote/serve-acp.ts`, new `src/remote/serve-acp-loop.ts`, `src/remote/serve.ts`

`RemoteAcp.run(frame)` replaces `prompt`. It drives `driveToolLoop` over the session with the frame's snapshot, emitting the loop frames. It keeps one pending-request map per session for caller tools, keyed by a per-session request counter. `RemoteAcp.cancel` aborts the loop's signal and cancels any in-flight provider turn. It sends `acp-run-end` with `cancelled` once the provider turn has ended, or at once when the loop was between turns, and drops pending requests so a late `acp-tool-result` is ignored. Close and dispose abort the loop the same way. The loop-driving code lives in the new `serve-acp-loop.ts` so `serve-acp.ts` stays under the limit. `RemoteServer.dispatch` routes `acp-run` and `acp-tool-result`.

### File read — new `src/file-read/`

- `command.ts`: the parser, primer slice, and line recognizer together, mirroring `src/browser/command.ts` (`parseBrowserCommand`, `BROWSER_PRIMER`, `isBrowserCommandLine`). `parseFileRead(input)` is pure and returns the path, offset, and limit, or the usage error, applying the rules in decision 18. `FILE_READ_PRIMER` and `isFileReadCommandLine` sit beside it.
- `read.ts`: `readWorkspaceLines(root, args)` resolves and contains the path (`containedPath` plus `realpathSync` so a symlink cannot escape), applies the secret rule against `SECRET_DENY_PATHS`, checks the 5 MB cap with `statSync().size` before reading, and decodes with `new TextDecoder('utf-8', { fatal: true })` so invalid UTF-8 or binary content becomes `Not a text file`. It numbers lines with `padStart` and adds the truncation notice or the empty-file text. It returns the result string or one of the error lines in decision 17. It is the only module that touches disk, and it runs on whichever host owns the root. The whole file is read into memory, which the 5 MB cap bounds; a streaming reader is the upgrade if the cap is ever raised.

### Typed `file` command — new `src/commands/file.ts`, registry

A `Command` named `file` in `src/commands/file.ts`, listed in the registry in `src/commands/index.ts`, with `parseFileRead` doing all argument handling. On a local tab it calls `readWorkspaceLines` with the tab's `workspaceDir`, or the project directory (`managers.tab.launchDir`, the `TabManager` getter over the project directory in `src/tab/manager.ts`) when the tab has none. The ACP tool's local `runWorkspace` uses the same rule, so typed and agent reads agree. On a remote tab it opens a `RemoteFileSystemPort` the way `resourceFor` in `src/plugins/remote-capabilities.ts` does, using `managers.remote.get(label)`, `readyOf(label)`, and `workspaceOf(label)`. It uses its own session id, `file-read-<n>` from a module counter, because the plugin and navigator ports already use the tab label as their session id on the same channel. It calls the port's new `readLines`, prints the returned text, and disposes the port in a `finally`. A missing channel, or a request that fails with the channel's `Remote connection unavailable.` error, prints exactly that line.

### Remote filesystem operation — `src/remote/filesystem/operations.ts`, `src/remote/protocol-frames.ts`, `src/file-navigator/remote/port.ts`

A read-only `read-lines` operation with `path`, optional `offset`, and optional `limit`, modeled on the `read-file` descriptor (`'read-file': descriptorFor<'read-file'>()` in `operations.ts`): same `pathOnly`-style decode and `namedPath` containment, a validator for the two optional positive integers, and a result decoder for `{ text }`. Its `run` calls `readWorkspaceLines(context.root, args)`. `RemoteFileSystemPort` gains `readLines(root, relPath, offset?, limit?)`, mapped with `this.paths.to` like `readFile`. It is a method on the remote port only, not on the `FileSystemPort` interface: the local path calls `readWorkspaceLines` directly. The operation is covered by the same version bump.

### Vocabulary and roles

- `NATIVE_ACP_COMMANDS` gains `file read` after `question approve`.
- `APPLICATION_COMMAND_NATIVE_TOOLS` gains `file`. `nativeCommandTool` in `src/acp/native-commands.ts` maps `file …` to it; today it falls through to `question` for any non-db, non-browser name, so the new branch must come before that fall-through. The commands-tab payload check (`NATIVE_TOOLS` in `src/plugins/commands/shared.ts`) derives from the constant and needs no edit.
- The default `ask` and `tell` roles in `src/plugins/roles/roles-file.ts` grant `file read`.
- The commands tab and the roles tab list `file read` automatically from the vocabulary; no web change is needed.

### Specs and docs

- `product/specs/acp.md`: the autonomous tool loop section (per-prompt snapshot, caller and workspace sides, `file read`, the `[<host>] ` tag), and the remote connections section (the loop runs on the far side).
- `product/specs/remote-server.md`: the three-way split paragraph, the agent-run paragraph, the protocol version 40 paragraph, and the out-of-scope bullet that says the tool loop stays local.
- `product/specs/roles.md`: the default `ask` and `tell` grants and the count of native commands.
- `product/specs/agent-command.md`: agent runs on a remote host run their loop there.
- `product/specs/application-commands.md`: the paragraph that begins "An ACP agent command is checked again immediately before every emitted call" becomes the per-prompt snapshot rule, keeping the dispatcher's live guard (decisions 4 and 5).
- `help/file.md` (new) and a `file` row in the table in `help/commands.md`; the command reference page is generated from them.
- `documentation/user-documentation/advanced-agents/acp-agent.md`: the tool list and the paragraph saying database, browser, and question act on the local machine (add `file read` and where it runs).
- `documentation/user-documentation/advanced-agents/remote-agents.md`: the "What stays local" section and the agent-run paragraph that says the autonomous tool loop stays on your machine.

### Implementation order

The whole plan ships as one pull request. Within it, each step leaves typecheck and tests green:

1. The `file read` module, the `file` vocabulary and default grants, and the typed `file` command for local tabs.
2. The rewritten tool table and gate, the snapshot type, and the driver, with `runCorePrompt` and `executeAgentRun` switched to them for local sessions only. This is where per-prompt settings take effect.
3. Protocol 40 as one change: the frame swap, the far-side loop, `RemoteAcpSession.run`, the session type split, and the remote agent-run path. `acp-prompt` cannot be removed in a smaller piece without breaking remote tabs in between.
4. The `read-lines` operation and the typed `file read` for remote tabs. It shares the version bump, so it lands in the same pull request as step 3.
5. Specs, help, and docs.

## Tests

Colocated vitest files, following each area's existing tests:

- `src/acp/tool-table.test.ts` — table order, granted-owner filtering, primer and allow-list text, and extraction including `file read`; for `gateCommand`, refusal order and text, disabled before not-allowed, the `refused` flag, agent-kind rules, and the snapshot being used rather than live settings. Its settings-change-within-a-prompt case is rewritten to the per-prompt rule.
- `src/acp/drive-loop.test.ts` — caller and workspace routing, events in order, step cap and the capped paragraph, agent kind with unlimited steps, cancellation suppressing late results.
- `src/acp/run-prompt.test.ts` — the local path still produces the same transcript entries, records, notifications, and settled replies; a settings change mid-prompt applies from the next prompt; a remote-run step is tagged `[<host>] `.
- `src/file-read/command.test.ts` and `src/file-read/read.test.ts` — every usage form, offset and limit edges, the 2000-line and 2000-character caps, the truncation notice, an empty file, each error line, a symlink escaping the root, and secret names.
- `src/commands/file.test.ts` — local root selection (workspace, else project) and the remote unavailable line.
- `src/remote/serve-acp.test.ts` — the far side runs a workspace tool itself, forwards a caller tool and feeds back its result, honours the snapshot, ignores a late tool result after cancel, sends `acp-run-end` with `cancelled`, and aborts on close.
- `src/remote/acp-session.test.ts` — loop frames become event calls, a tool request is answered, and cancellation drains on the terminal frame.
- `src/remote/protocol.test.ts` and the frame decode tests — `acp-run`, `acp-tool-result`, the new server frames, and snapshot validation; `acp-prompt` and `acp-end` are now unknown; the version is 40.
- `src/agent/execute.test.ts` — a remote run drives the far-side loop and tags remote-run steps.
- `src/remote/filesystem/operations.test.ts` — `read-lines` validation, containment, and result decoding.
- Existing tests that send or expect `acp-prompt` or `acp-end` move to the new frames: `src/acp/manager.test.ts` (the `{ type: 'acp-prompt', … }` expectations), the fake far side in `src/acp/index.test.ts`, `src/remote/channel/index.test.ts`, `src/remote/serve.test.ts`, `src/remote/serve-acp.test.ts`, `src/remote/acp-session.test.ts`, and `src/remote/protocol.test.ts`.

## Out of scope

- Running `db`, `browser`, or `question` on the remote host; they stay caller tools.
- Showing a remote host's databases or browsers in the local connections panel or sql tab.
- File write and file edit tools (a separate backlog item; they plug in as further workspace tools).
- Keeping a far-side loop running across a transport loss, or replaying loop events on reattach.
- Changing monitors, conversations, and editor persona ACP consumers, which do not enter the tool loop.
- Tagging typed `file read` output, or caller-side steps, with a host.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, with a remote shell tab on a host whose clone has a file the local checkout lacks (for example a new `notes/remote-only.md` committed only on the remote):
  1. `tell read notes/remote-only.md and summarize it` — the transcript shows a `[<host>] file read notes/remote-only.md` tool step and a correct summary.
  2. Type `file read notes/remote-only.md --limit 3` — three numbered lines, untagged.
  3. `tell create a sqlite database named probe` — `probe.sqlite` appears under the **local** `.janissary/db/sqlite/` and in the local connections panel, and the step is untagged.
  4. `ask` something that makes the agent emit `question ask …` — the question panel appears locally and the answer reaches the remote agent.
  5. Start a long `tell`, then `tell reset` mid-run — the prompt settles at once and no further tool step appears.
  6. On a local tab, `file read .env` prints `Secret file: .env.` and `file read ../x` prints `Outside the workspace: ../x.`.
