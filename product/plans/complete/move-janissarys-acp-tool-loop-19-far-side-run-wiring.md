# ACP tool loop 19 — `RemoteAcp.run` and far-side routing

**Complexity: 4/10** — ~30 added lines in 2 files, 7 requirements, 8 scenarios (p=5.10)

Run order: 19 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `RemoteAcp.run(frame)`, pending-map, module-split, and `RemoteServer.dispatch` sentences of "Far side"; decision 1, far-side half). Depends on subplan 18 (`move-janissarys-acp-tool-loop-18-far-side-loop-module.md`). Subplan 20 adds abort. The local adapter built in subplan 21 (`RemoteAcpSession.run`) is the first code to send `acp-run` in its tests; subplan 23 makes it the production path.

Subplan 18 built the far-side loop as a module. This subplan gives it a home and a route. `RemoteAcp` starts a loop when an `acp-run` arrives for a live session, keeps the loop's handle on that session's record, and passes `acp-tool-result` frames to it. `RemoteServer` routes both frames. `acp-prompt` keeps working beside it until subplan 25.

## Design decisions

- **`RemoteAcp.run(frame)`** starts `startRemoteLoop` over the session's own `connectAcp` session, with the frame and the workspace directory `RemoteAcp` was constructed with (`this.workspaceDir`, `src/remote/serve-acp.ts:51-55`).
  - A frame for a session that is not live gets today's fatal `No remote ACP session is open.`, the same refusal `prompt` sends at `src/remote/serve-acp.ts:90-93`.
  - A live session that already holds a run gets a non-fatal `acp-error` reading `ACP: a prompt is already running.`, the exact text `AcpPromptControl.admit` uses (`src/acp/prompt-control.ts:20-23`). The local side admits one run at a time (subplan 21), so this is a guard, not a path.
  - Otherwise `run` attaches the returned handle to the live record and passes `frame.text` and `frame.snapshot` through unchanged. The loop module already stamps `frame.id` on every frame it sends, so this class adds no per-frame translation.
- **`RemoteAcp.toolResult(frame)`** looks the record up by `frame.id` and hands the frame to its run handle. A result for a session that is not live, or has no run in flight, is ignored — the module already ignores an unknown or settled request (`src/remote/serve-acp-loop.ts:73-79`).
- **Clearing the handle.** A run is over on `acp-run-end` or a non-fatal `acp-error`, its only two terminal frames: the first is the `finished` mapping and the second the `error` mapping at `src/remote/serve-acp-loop.ts:53-54`, and a rejected caller result reaches the second (`src/acp/loop.ts:55-61`). `RemoteLoopHandle` exposes only `toolResult` (`src/remote/serve-acp-loop.ts:10-12`), so `run` wraps the `send` it passes to `startRemoteLoop`: forward each frame, and on either terminal frame clear the live record's handle. Subplan 18 recorded this split and deliberately left the module's return type without a completion callback.
  - A scripted or synchronous session can finish the loop inside the `startRemoteLoop` call, before the handle has been attached. Track whether the wrapper has seen a terminal and attach nothing in that case, so a finished run never leaves a stale guard behind.
  - A fatal `acp-error` comes from the connection (`open`'s `onError`, `src/remote/serve-acp.ts:81`), not from the run, and does not clear the handle. The session is already unusable in that state today; aborting a run when the session is closed or disposed is subplan 20.
- **State on the record.** The handle is the optional field `run?: RemoteLoopHandle` on the live member of `RemoteAcpRecord` (`src/remote/serve-acp.ts:11-14`), not a second map beside `records` (architecture principle 2, `ai/guidelines/architecture-principles.md:15-21`). `serve-acp-loop.ts` keeps its current shape: `AcpSession` already satisfies `AcpLoopSession` (`src/acp/types.ts:10-16` and `:71-73`), and `RemoteLoopHandle` is reused as exported.
- **Module split.** The loop-driving code stays in `src/remote/serve-acp-loop.ts`; this subplan does not edit it. `serve-acp.ts` (147 effective lines) gains `run`, `toolResult`, the record field, and the type import — about 30 lines — so it stays under the 200-line limit.
- **Routing.** `RemoteServer.dispatch` (`src/remote/serve.ts:115-158`) adds two cases beside `acp-prompt` (`:153`):
  - `acp-run` behind `requireWorkspace`, in the same shape as `acp-prompt`: without a provisioned workspace it gets the existing `No remote workspace has been provisioned.` refusal (`:250-254`).
  - `acp-tool-result` straight to `this.acp?.toolResult(frame)`, with no `requireWorkspace`, like `acp-close` and `acp-cancel` (`:154-155`). A result can only answer a run that a provisioned workspace already admitted; refusing it before provisioning would send a spurious `workspace-failed` for a harmless late frame.
  - Both cases are one line, so `serve.ts` goes from 195 to 197 effective lines. Subplan 25 removes the `acp-prompt` case, so the file never passes 200.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Far-side ACP holder, its records, and today's per-prompt path | `RemoteAcp`, `RemoteAcpRecord`, `prompt` in `src/remote/serve-acp.ts` |
| Frame dispatch and workspace requirement | `RemoteServer.dispatch`, `requireWorkspace` in `src/remote/serve.ts` |
| Loop module and run handle | `startRemoteLoop`, `RemoteLoopHandle` in `src/remote/serve-acp-loop.ts` (subplan 18) |
| Frame decoding, validation, and the dispatch union for both frames | `decodeAcpRun`, `decodeAcpToolResult` in `src/remote/frame/decode-acp-run.ts:5-23`; `CLIENT_FRAME_TYPES` in `src/remote/protocol-frames.ts:318` (subplans 14 and 15) |
| The one-run-at-a-time refusal text | `AcpPromptControl.admit` in `src/acp/prompt-control.ts:20-23` |

## Proposed changes

- `src/remote/serve-acp.ts`: `run(frame)`, `toolResult(frame)`, the `run?: RemoteLoopHandle` field on the live record, and the terminal-watching `send` wrapper inside `run`. Import `startRemoteLoop` and `type RemoteLoopHandle` from `./serve-acp-loop.js`; the loop module imports nothing from `serve-acp.ts`, so there is no cycle, and NodeNext requires the `.js` extension.
- `src/remote/serve.ts`: the two dispatch cases described above.
- `src/remote/serve-acp-loop.ts`, `src/remote/protocol-frames.ts`, and `src/remote/frame/decode-acp-run.ts`: no change; subplans 14 to 18 already own them.

## Tests

`src/remote/serve-acp.test.ts` (the suite fakes `connectAcp` at `:15-20`; `makeAcp` returns a recording `frames` array at `:31-35`):
- Give `makeAcp` an optional workspace directory, defaulting to today's `WORKSPACE`, and use a `mkdtempSync` root for the run tests the way `src/remote/serve-acp-loop.test.ts:41-49` does. `/srv/proj/...` does not exist, and a `file read` against it would report a missing file instead of exercising the read.
- Add the `coreSnapshot` helper from `src/remote/serve-acp-loop.test.ts:16-20`; use a `tell` snapshot granting `['file read', 'db sqlite query']`.
- One live run end to end: the fake provider's turns are `file read a.md` (with `a.md` written in the temp root), then `db sqlite query movies SELECT 1`, then `Done.`. Drive each turn through `lastHandlers()` (`:38-40`) with `onChunk` then `onEnd('end_turn')`, and `await flush()` (`src/remote/serve-acp-loop.test.ts:67`) after each because the loop's `onEnd` continuation is async. Assert the `acp-tool-step` for the read, the `acp-tool-request` with `request: 1`, that answering it through `toolResult` makes the next provider prompt contain the output, and the run closes with `acp-run-end answered`.
- A run for a missing or closed id emits the fatal `No remote ACP session is open.` and never calls `acpMock.prompt`.
- A second `run` while the first is still in flight emits exactly the non-fatal `ACP: a prompt is already running.` frame and leaves `acpMock.prompt` called once.
- `toolResult` for a live session with no run, and after the run has ended, sends nothing and does not throw.
- The handle is cleared on both terminals: after `acp-run-end` a second `run` is admitted, and after a caller result carrying `error` ends a run with a non-fatal `acp-error`, a subsequent `run` is admitted too.

`src/remote/serve.test.ts` (real server, faked `connectAcp` at `:29-54`, `makeServer`'s recording `frames` at `:109-114`):
- Extend `refuses an ACP frame that arrives before a workspace exists` (`:344-356`) with an encoded `acp-run`: it adds one `workspace-failed` and still sends no prompt.
- Add a sibling to `drives the ACP holder once a workspace has been provisioned` (`:358-378`) rather than changing its existing prompt assertion: provision a workspace, send `acp-run` with a `tell` snapshot granting `['db sqlite query']`, drive the first prompt's handlers to a caller command, then send an encoded `acp-tool-result` with `request: 1`. `await vi.waitFor` the `acp-tool-request` frame, then the second `acpMock.prompt` call, and assert its text contains the result. That observes the whole dispatch path, including the base64 decode, and no `workspace-failed` frames appear.

## Out of scope

Cancellation, close, dispose, and transport loss while a run is in flight (subplan 20). The local side of the run (subplans 21 to 23). What happens to a run when the agent connection dies fatally; that keeps today's live-record behavior. No source change outside the two files above.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes, because no production code sends `acp-run` until subplan 23. Confirm `src/remote/serve.ts` is at 197 effective lines and `src/remote/serve-acp.ts` stays under 200.
