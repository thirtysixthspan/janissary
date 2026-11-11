# ACP tool loop 18 — the far-side loop module

**Complexity: 4/10** — ~95 added lines in one new module, 10 requirements, 9 scenarios (p=5.14)

Run order: 18 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Far side", the far-side bullet of "One loop driver"; decisions 2, 3, 4, 6, 7, and 13, far-side halves). Depends on subplans 3, 10, 12, 15, 16, and 17 (`move-janissarys-acp-tool-loop-3-file-read-reader.md`, `move-janissarys-acp-tool-loop-10-loop-driver-module.md`, `move-janissarys-acp-tool-loop-12-agent-driver-kind.md`, `move-janissarys-acp-tool-loop-15-tool-result-frame.md`, `move-janissarys-acp-tool-loop-16-turn-frames.md`, `move-janissarys-acp-tool-loop-17-tool-frames.md`). Subplan 19 wires it into `RemoteAcp` and `RemoteServer`, and subplan 20 adds abort.

`janus remote-serve` will run a whole loop per `acp-run`, with the same driver the local side uses. This subplan builds that loop as a self-contained module that takes a session, the frame, the workspace directory, and a `send` function. It maps the driver's host and events onto loop frames:
- workspace tools run against the far side's own workspace directory;
- caller tools go back to the local side as `acp-tool-request` and wait for the matching `acp-tool-result`.

Nothing routes frames to it until subplan 19.

## Design decisions

- **Entry.** `startRemoteLoop(session, frame, workspaceDir, send)` drives `driveToolLoop` over the given `connectAcp` session with the frame's text and snapshot. It returns a handle holding the run's abort controller, its request counter, its pending-request map, and a `toolResult(frame)` method.
- **Snapshot honored** (source decision 4). The far side builds its primer, tool table, extractor, step cap, and gate from the frame's snapshot alone, never from settings of its own.
- **Workspace host** (source decision 13). `runWorkspace` is `readWorkspaceCommand(workspaceDir, command)` from subplan 3. The root is whatever workspace directory the caller passes, which subplan 19 makes the one `RemoteAcp` was constructed with: the remote clone for a tab, and the run's execution directory for an agent run.
- **Caller host** (source decision 3). `runCaller` assigns the next per-run request number, sends `acp-tool-request { id, request, command }`, and waits.
  - The handle's `toolResult` resolves that request with its `output` or rejects it with its `error`.
  - A rejection reaches `runAcpToolLoop`'s catch and ends the run with a non-fatal `acp-error` carrying that message, as a throwing local runner ends a local loop today.
  - A result for an unknown request is ignored.
- **Events to frames.**
  - `startTurn(first)` sends `acp-turn start`.
  - `endTurn(display)` sends `acp-turn end`.
  - `finished(reason)` sends `acp-run-end` with `answered` or `capped`.
  - `error(message)` sends a non-fatal `acp-error`.
  - `startCommand` sends nothing: a caller step is recorded by the local side when it receives the request, and a far-side step travels whole in `acp-tool-step`.
  - `ranCommand` sends `acp-tool-step { command, result, workspace, refused? }` for every step the far side completed on its own. That is a workspace run, or any gate refusal, including the not-allowed and agent not-permitted refusals that carry no `refused` flag (source decision 6). A caller step that went out as a request sends nothing. The host remembers which step it forwarded, so `ranCommand` can tell the two apart.
- **Chunks.** The module wraps the session it hands the driver and forwards each provider delta as `acp-chunk` exactly as it arrived. The loop's cumulative `chunk` event is not sent, so the deltas are byte-for-byte what the provider produced, and the local side rebuilds the cumulative text per turn (subplan 21).
- **Semantics preserved** (source decision 7). These come from the shared driver: the eight-step cap for `core`, unlimited steps for `agent`, the one cold-start retry in the same turn, removal of the command line from `display`, and a `withoutTools` snapshot running with no tools.
- **Purity of imports.** The module imports the driver, the reader, and frame types only. It never imports `Managers` or the command registry.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Driver | `driveToolLoop`, `CORE_MAX_STEPS` in `src/acp/drive-loop.ts` (subplans 10 and 12) |
| Workspace runner | `readWorkspaceCommand` in `src/file-read/read.ts` (subplan 3) |
| Frames | `acp-tool-result` (subplan 15); `acp-turn`, `acp-run-end` (subplan 16); `acp-tool-request`, `acp-tool-step` (subplan 17) |
| Today's per-prompt frame mapping | `RemoteAcp.prompt` in `src/remote/serve-acp.ts` |

## Proposed changes

New `src/remote/serve-acp-loop.ts`: `startRemoteLoop` and its handle, the two host functions, the event-to-frame mapping, and the chunk-forwarding session wrapper.

## Tests

New `src/remote/serve-acp-loop.test.ts`, with a fake session scripted per turn and a recording `send`:
- a granted `file read` reply runs against a real temporary workspace and sends `acp-tool-step` with `workspace: true`, then a follow-up turn;
- a `db` reply:
  - sends `acp-tool-request` with request 1;
  - after `toolResult` answers, feeds its output into the follow-up prompt;
  - sends no `acp-tool-step`;
- an error result ends the run with a non-fatal `acp-error`;
- the snapshot is honored:
  - an agent-off row refuses with `refused: 'disabled'`;
  - an ungranted command refuses with no flag;
  - a `withoutTools` snapshot sends a primer with no tool slices;
- frames come in order (`acp-turn start`, `acp-chunk` deltas, `acp-turn end`, `acp-run-end answered`), and eight steps end with `acp-run-end capped`;
- an agent snapshot runs `janissary file read` in the workspace and forwards `janissary db sqlite list` as `db sqlite list`;
- a result for an unknown request is ignored.

## Out of scope

`RemoteAcp` and `RemoteServer` wiring (subplan 19). Cancellation, close, dispose, and transport loss (subplan 20). Running `db`, `browser`, or `question` on the remote host; they stay caller tools.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
