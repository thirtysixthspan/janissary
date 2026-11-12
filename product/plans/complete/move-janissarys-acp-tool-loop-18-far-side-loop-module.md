# ACP tool loop 18 — the far-side loop module

**Complexity: 5/10** — ~95 added lines in one new module with no edited files, 13 requirements, 15 scenarios (p=5.50)

Run order: 18 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Far side", the far-side bullet of "One loop driver"; decisions 2, 3, 4, 6, 7, and 13, far-side halves). Depends on subplans 3, 10, 12, 15, 16, and 17 (`move-janissarys-acp-tool-loop-3-file-read-reader.md`, `move-janissarys-acp-tool-loop-10-loop-driver-module.md`, `move-janissarys-acp-tool-loop-12-agent-driver-kind.md`, `move-janissarys-acp-tool-loop-15-tool-result-frame.md`, `move-janissarys-acp-tool-loop-16-turn-frames.md`, `move-janissarys-acp-tool-loop-17-tool-frames.md`). Subplan 19 wires it into `RemoteAcp` and `RemoteServer`, and subplan 20 adds abort.

`janus remote-serve` will run a whole loop per `acp-run`, with the same driver the local side uses. This subplan builds that loop as a self-contained module that takes an `AcpLoopSession`, the `acp-run` frame, the workspace directory, and a `send` function. It maps the driver's host and events onto loop frames:
- workspace tools run against the far side's own workspace directory;
- caller tools go back to the local side as `acp-tool-request` and wait for the matching `acp-tool-result`.

Nothing routes frames to it until subplan 19.

## Design decisions

- **Entry.** `startRemoteLoop` is exported from the new module and takes four arguments: the session (typed `AcpLoopSession` at `src/acp/types.ts:71`, the structural subset the driver needs; `connectAcp`'s `AcpSession` satisfies it, so subplan 19 passes the record's session unchanged), the `acp-run` member of `ClientFrame`, the workspace directory, and a `send` callback taking a `ServerFrame`. It drives `driveToolLoop` (`src/acp/drive-loop.ts:58`) with `frame.text` and `frame.snapshot`, and returns an exported `RemoteLoopHandle` that owns the run's abort controller, request counter, and pending-request map and exposes a `toolResult(frame)` method. Every frame it emits carries the `acp-run` frame's `id`. The handle exposes no completion callback; subplan 19 clears its record by wrapping the `send` it passes and watching for `acp-run-end` (`src/remote/protocol-frames.ts:275`) or a non-fatal `acp-error` (`:283`), the run's two terminals.
- **Snapshot honored** (source decision 4). The module passes `frame.snapshot` straight through; it never reads settings of its own. `driveToolLoop` builds the primer, tool table, extractor, step cap, and gate from that snapshot alone (`src/acp/drive-loop.ts:62-70`).
- **Workspace host** (source decision 13). `runWorkspace` calls `readWorkspaceCommand` (`src/file-read/read.ts:94`) with the command trimmed and one leading slash dropped, exactly as `executeAgentRun`'s local `runWorkspace` does at `src/agent/execute.ts:144`: an agent reply of `janissary /file read a.md` reaches the runner as `/file read a.md`, which `gateAgentCommand` recognizes (`src/acp/tool-table.ts:121`) and `parseFileRead` does not, so the trim is required to match local behavior. Core commands never carry the slash. The root is the `workspaceDir` argument; subplan 19 passes the directory `RemoteAcp` was constructed with (`src/remote/serve-acp.ts:51-55`), which is the peer's provisioned clone. An agent run reaches that same peer directory through its peer's `RemoteAcp`, so no second root rule is needed here.
- **Caller host** (source decision 3). `runCaller` takes the next per-run request number, sends `acp-tool-request { id, request, command }`, and waits for the matching `acp-tool-result`. The counter is per run because `request` is the run's counter value scoped by `id` (`src/remote/protocol-frames.ts:262-266`).
  - Numbering follows `RemoteFileSystemPort.request` (`src/file-navigator/remote/port.ts:31` and `:195`): the counter starts at 0 and is pre-incremented, so the first request is 1.
  - Register the pending entry before sending the frame, so a result delivered synchronously by a test's `send` still finds it. Take a request out of the map before resolving or rejecting it, so a duplicate or late result cannot settle it twice.
  - The handle's `toolResult` takes the `acp-tool-result` member of `ClientFrame` and resolves the request when `output` is present, including an empty string: an empty output is a successful step (`src/remote/protocol-frames.ts:269-271`). It rejects with an `Error` carrying the frame's `error` text when `output` is absent; `decodeAcpToolResult` admits exactly one of the two (`src/remote/frame/decode-acp-run.ts:11-23`).
  - A rejection reaches `runAcpToolLoop`'s catch and ends the run with a non-fatal `acp-error` carrying that message, as a throwing local runner ends a local loop today (`src/acp/loop.ts:55-61`).
  - A result for an unknown request — one never issued, or one already settled — is ignored.
- **Events to frames.** Every frame below carries the `acp-run` frame's `id`.
  - `startTurn(first)` sends `acp-turn { phase: 'start', first }`.
  - `endTurn(display)` sends `acp-turn { phase: 'end', display }`.
  - `finished(reason)` sends `acp-run-end { reason }` with `answered` or `capped`; ignore the event's `maxSteps`, because the protocol carries no step count (`src/remote/protocol-frames.ts:272-275`).
  - `error(message)` sends `acp-error { message, fatal: false }`.
  - `chunk` is a no-op on the event object; the wrapper below owns chunk forwarding.
  - `startCommand` sends nothing: a caller step is recorded by the local side when it receives the request, and a far-side step travels whole in `acp-tool-step`.
  - `ranCommand` sends `acp-tool-step { command, result, workspace, refused? }` for every step the far side completed on its own. That is a workspace run (`workspace: true`), or any gate refusal (`workspace: false`), including the not-allowed and agent-not-permitted refusals that carry no `refused` flag (source decision 6; `src/acp/tool-table.ts:109-124`). A caller step that went out as a request sends nothing. `runCaller` sets a per-run `forwarded` flag before sending, and this mapping reads and clears it; do not use `startCommand` to tell the two apart, because it fires with `workspace: false` for both a caller step and a refusal (`src/acp/drive-loop.ts:47-54`). The frame's `workspace` is always a boolean: the event's optional `workspace` means false.
- **Chunks.** The module wraps the session it hands the driver: the wrapper's `prompt` passes each provider delta to the driver's `onChunk` and sends `acp-chunk { text: delta }` with the same delta. The loop's cumulative `chunk` event is a no-op, so the frames are byte-for-byte the provider's deltas and the local side rebuilds the cumulative text per turn (subplan 21). A scripted reply must be emitted as more than one delta in the test, or a leaked cumulative frame would be indistinguishable from a delta.
- **Semantics preserved** (source decision 7). These come from the shared driver: the eight-step cap for `core` (`CORE_MAX_STEPS = 8` at `src/acp/drive-loop.ts:23`), unlimited steps for `agent`, the one cold-start retry in the same turn (`src/acp/loop.ts:36-47`), removal of the command line from `display` (`src/acp/loop.ts:81-92`), and a `withoutTools` snapshot running with no tools (`src/acp/drive-loop.ts:62`).
- **Purity of imports.** The module imports `driveToolLoop`, `readWorkspaceCommand`, `deferred` (`src/deferred.ts:9`), and the ACP and protocol frame types. It never imports `Managers`, the command registry, or `src/remote/serve-acp.ts`, so it stays loadable on the far side and adds no cycle.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Driver | `driveToolLoop` (`src/acp/drive-loop.ts:58`), `CORE_MAX_STEPS` (`:23`), `DrivenStep` (`:25`) (subplans 10 and 12) |
| Workspace runner | `readWorkspaceCommand` in `src/file-read/read.ts:94` (subplan 3) |
| Pending promise | `deferred` in `src/deferred.ts:9`, used by `src/remote/acp-session.ts:58` |
| Frames | `acp-tool-result` (`src/remote/protocol-frames.ts:159`, subplan 15); `acp-turn`, `acp-run-end` (`:260-275`, subplan 16); `acp-tool-request`, `acp-tool-step` (`:266`, `:271`, subplan 17) |
| Today's per-prompt frame mapping | `RemoteAcp.prompt` in `src/remote/serve-acp.ts:87-101` |
| Fake loop session and flush | `makeSession` and `flush` in `src/acp/drive-loop.test.ts:62-75` and `:111` |
| Recording send | `makeAcp`'s `frames` array in `src/remote/serve-acp.test.ts:31-35` |
| Temporary workspace | the `mkdtempSync` temporary-root pattern in `src/file-read/read.test.ts:12-19` |

## Proposed changes

- New `src/remote/serve-acp-loop.ts`: exported `startRemoteLoop` and `RemoteLoopHandle`, the two host functions, the event-to-frame mapping, and the chunk-forwarding session wrapper. At about 95 lines it stays well under the 200 effective-line limit, so no extraction is expected. Relative imports carry the `.js` extension required under `src/`.
- No existing production file changes. `src/remote/serve-acp.ts`, `src/remote/serve.ts`, and `src/remote/protocol-frames.ts` stay untouched (subplans 19 and 20), and no production module imports the new one yet, so the only caller is the new test file.

## Tests

New `src/remote/serve-acp-loop.test.ts`, colocated per `src/**/*.test.ts`. Start from `makeSession` in `src/acp/drive-loop.test.ts:62` for the fake `AcpLoopSession`, but script each turn as an array of deltas so the chunk assertion can distinguish a delta from the loop's cumulative text; advance it with the `flush` helper at `:111` after answering a tool result. Record frames the way `makeAcp` does in `src/remote/serve-acp.test.ts:31`: a `ServerFrame` array that the `send` callback pushes each frame into. Those are pre-encoding frames, so `command` and `result` are raw strings. Use the `mkdtempSync` temporary-root pattern in `src/file-read/read.test.ts:12-19` for the real workspace.
- a granted `file read` reply runs against the temporary workspace and sends `acp-tool-step` with `workspace: true` and the numbered result, then a follow-up turn;
- a `db` reply:
  - sends `acp-tool-request` with `request: 1`;
  - after `toolResult` answers, feeds its output into the follow-up prompt and sends no `acp-tool-step`;
  - a second caller round trip uses `request: 2`;
  - an empty `output` still resolves the step and feeds an empty result back;
- an error result ends the run with a non-fatal `acp-error` and no `acp-run-end`;
- the snapshot is honored:
  - an agent-off row refuses with `workspace: false` and `refused: 'disabled'`;
  - an ungranted core command refuses with `workspace: false` and no `refused`;
  - an agent snapshot without the `file` grant refuses a `janissary file read a.md` reply with an `acp-tool-step` carrying `command: 'file read a.md'`, `workspace: false`, and no `refused`;
  - a `withoutTools` snapshot sends a primer starting with `NO_TOOLS_LINE` (`src/acp/internal-tools.ts:41`) and no tool slices;
- frames come in order for a caller turn (`acp-turn start` with `first: true`, two `acp-chunk` deltas that are not cumulative, `acp-turn end`, `acp-tool-request`, then after the result the follow-up `acp-turn start` with `first: false`, `acp-run-end answered`);
- eight workspace steps end with `acp-run-end capped` and no step count: use a granted `file read` so the steps run synchronously, because a caller step would need eight interleaved `toolResult` answers;
- an agent snapshot runs a `janissary file read` reply in the workspace (the step carries `file read ...`) and forwards a `janissary db sqlite list` reply as `db sqlite list`;
- an agent reply `janissary /file read a.md` still reads the file in the workspace, covering the leading-slash trim;
- a result for an unknown request, including one already settled, is ignored.

## Out of scope

`RemoteAcp` and `RemoteServer` wiring (subplan 19): the new module is not imported by production code yet. Cancellation, close, dispose, transport loss, and the `abort` method (subplan 20). The local adapter, its run state, and the frame handling that answers requests and shows steps (subplans 21 and 22). Running `db`, `browser`, or `question` on the remote host; they stay caller tools. Frame encoding and validation in `src/remote/protocol.ts` and `src/remote/frame/decode-acp-run.ts`; subplans 15-17 already own those.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm `src/remote/serve-acp-loop.ts` is under 200 effective lines, no production module imports it yet, and `src/remote/serve-acp.ts` and `src/remote/serve.ts` are unchanged. Nothing user-visible changes, so there is no manual UI check.
