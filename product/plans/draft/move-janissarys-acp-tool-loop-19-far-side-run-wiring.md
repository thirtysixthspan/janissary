# ACP tool loop 19 — `RemoteAcp.run` and far-side routing

**Complexity: 4/10** — ~30 added lines in 2 files, 6 requirements, 7 scenarios (p=4.96)

Run order: 19 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `RemoteAcp.run(frame)`, pending-map, module-split, and `RemoteServer.dispatch` sentences of "Far side"; decision 1, far-side half). Depends on subplan 18 (`move-janissarys-acp-tool-loop-18-far-side-loop-module.md`). Subplan 20 adds abort, and subplan 23 is the first to send it `acp-run`.

Subplan 18 built the far-side loop as a module. This subplan gives it a home and a route. `RemoteAcp` starts a loop when an `acp-run` arrives for a live session, keeps the loop's handle on that session's record, and passes `acp-tool-result` frames to it. `RemoteServer` routes both frames. `acp-prompt` keeps working beside it until subplan 25.

## Design decisions

- **`RemoteAcp.run(frame)`** starts `startRemoteLoop` over the session's own `connectAcp` session, with the frame and the workspace directory `RemoteAcp` was constructed with.
  - A frame for a session that is not live gets today's fatal `No remote ACP session is open.`.
  - A second `acp-run` while one is in flight gets a non-fatal `acp-error` reading `ACP: a prompt is already running.`, the text `AcpPromptControl.admit` uses. The local side admits one run at a time, so this is a guard, not a path.
- **`RemoteAcp.toolResult(frame)`** hands the frame to the handle of the session's run in flight. A result for a session with no run in flight is ignored.
- **State on the record.** The run handle hangs off the session's `live` record in `RemoteAcp`, not off a new map beside it (architecture principle 2). It is cleared when the run ends.
- **Module split.** The loop-driving code stays in `src/remote/serve-acp-loop.ts`. `serve-acp.ts` (147 effective lines) only adds `run`, `toolResult`, and the handle field, so it stays under the limit.
- **Routing.** `RemoteServer.dispatch` (`src/remote/serve.ts`, 195 effective lines) routes `acp-run` behind `requireWorkspace`, as it routes `acp-prompt`, and routes `acp-tool-result` to `RemoteAcp`. Subplan 25 removes the `acp-prompt` case, so the file never passes 200.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Far-side ACP holder, its records, and today's per-prompt path | `RemoteAcp`, `RemoteAcpRecord`, `prompt` in `src/remote/serve-acp.ts` |
| Frame dispatch and workspace requirement | `RemoteServer.dispatch`, `requireWorkspace` in `src/remote/serve.ts` |
| Loop module | `startRemoteLoop` in `src/remote/serve-acp-loop.ts` (subplan 18) |

## Proposed changes

- `src/remote/serve-acp.ts`: `run(frame)` and `toolResult(frame)`, with the handle kept on the live record.
- `src/remote/serve.ts`: the two dispatch cases.

## Tests

- `src/remote/serve-acp.test.ts`:
  - an `acp-run` on a live session runs a workspace step and a caller round trip end to end through `RemoteAcp`;
  - a run on a closed session is fatal;
  - a second concurrent run is refused;
  - `toolResult` for a session with no run is ignored;
  - the handle is cleared after `acp-run-end`.
- `src/remote/serve.test.ts`: `acp-run` without a provisioned workspace is refused like `acp-prompt`, and `acp-tool-result` reaches `RemoteAcp`.

## Out of scope

Cancellation, close, dispose, and transport loss while a run is in flight (subplan 20). The local side of the run (subplans 21 to 23).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes, because no local code sends `acp-run` yet.
