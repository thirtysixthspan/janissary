# ACP tool loop 20 — cancelling, closing, and losing a far-side loop

**Complexity: 5/10** — ~45 added lines in 2 files, 12 requirements, 13 scenarios (p=5.70)

Run order: 20 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the cancel, close, and dispose sentences of "Far side"; decisions 9 and 10, far-side halves). Depends on subplan 19 (`move-janissarys-acp-tool-loop-19-far-side-run-wiring.md`), which is implemented on this branch. Subplan 21 relies on its `acp-run-end cancelled` as the drain barrier.

Once the far side owns the loop, stopping a prompt has to stop the loop there. Cancelling the provider turn is not enough. Cancellation has to stop the loop from issuing another turn or tool, ignore a caller result that arrives late, and end with one terminal frame the local side can drain on. The same has to happen when the session closes, the server shuts down, the transport drops, or the agent connection dies.

## Design decisions

- **Handle API.** `RemoteLoopHandle` (`src/remote/serve-acp-loop.ts:10-12`, today only `toolResult`) gains two methods with deliberately different frame behavior:
  - `cancel(): Promise<void>` is the `acp-cancel` path. It aborts the run, rejects and clears every pending caller request, awaits the provider cancellation, then sends the run's one `acp-run-end { reason: 'cancelled' }`.
  - `abort(): void` is every other teardown path. It performs the same abort and drop, but sends no frame and awaits nothing.
  - Both are idempotent: after the signal is aborted, `abort` does nothing and `cancel` returns the first call's promise, so one run can never produce two terminal frames.
- **Order inside both methods.** Abort the signal first, then reject the pending deferreds with `ACP: run aborted.`, then clear the pending map. This order is load-bearing: `driveToolLoop` wraps a caller request in `settleUnlessAborted` (`src/acp/drive-loop.ts:27-34`), which swallows the rejection only when the signal is already aborted. Rejecting first would let `runAcpToolLoop`'s catch (`src/acp/loop.ts:55-61`) turn it into a non-fatal `acp-error` frame.
- **Cancel** (source decision 9). `RemoteAcp.cancel(id)` (`src/remote/serve-acp.ts:143-151`) on a live record with `record.run` delegates to `run.cancel()` and does not also call `record.session.cancel()`; the handle owns both. A live record with no run keeps today's path exactly.
  - Timing: `AcpSession.cancel` (`src/acp/index.ts:176-178`) resolves through `AcpPromptControl.cancel` (`src/acp/prompt-control.ts:49-61`) only after the provider notification settles and the turn drains, so awaiting it is what holds the run-end until the provider turn has ended. With no current provider turn it resolves at once; that is the between-turns case, including a pending caller result or a workspace step in progress. Do not invent a second turn-end signal.
  - One terminal frame: the loop's own `finished` mapping cannot fire after the abort (`src/acp/loop.ts:43` returns first), so the handle sends `acp-run-end cancelled` itself, once.
  - Failure: if `session.cancel()` rejects, `cancel()` rejects without sending a run-end. `RemoteAcp.cancel` keeps today's identity-guarded catch and exact text `ACP: cancellation failed: ${errorText(error)}` (`src/remote/serve-acp.ts:146-150`) and sends it as fatal; the fatal frame is that run's terminal frame. In the same guarded catch, clear `record.run`, leaving a live session with no run, which is today's shape after a failed cancel.
- **Nothing after the abort.** Guard every frame-producing callback in `src/remote/serve-acp-loop.ts` on the run's signal: the six callbacks on the `events` object at `:38-55`, the `acp-tool-request` send in `runCaller` at `:33`, and the `acp-chunk` send in the forwarding prompt's `onChunk` at `:62`. The last one matters because the events `chunk` mapping is a no-op (`:40`), so a guard only on the events object would still leak provider deltas after the abort. The loop already checks the signal at `src/acp/loop.ts:27` (starting a turn), `:37` (prompting), `:43` (a turn ending), and `:62` (after a command); its `onError` at `:74` is unguarded, so the mapping guard is what suppresses a late provider error. The deliberate `acp-run-end cancelled` send inside `cancel()` is the one unguarded send.
- **Close and dispose.** `close` (`src/remote/serve-acp.ts:130-141`) calls `abort()` and clears `record.run` before `trackShutdown`, never `session.cancel()`. Shutdown releases the control's turn (`src/acp/index.ts:184-192` and `src/acp/prompt-control.ts:63-71`), whose `onError` the mapping guard then suppresses. `acp-closed` still goes out exactly as today, and no `acp-run-end` does. `dispose` (`:163-178`) aborts each live record's run before starting its `stopSession`; it still sends nothing. This also covers the `acp-close` the local side sends in response to a fatal error (`src/remote/acp-session.ts:111-115`).
- **Transport loss** (source decision 10, far-side half). `RemoteServer.detach` (`src/remote/serve.ts:243-248`) already calls `this.acp?.detachRuns()`. `detachRuns` (`src/remote/serve-acp.ts:153-158`) changes from "run-only sessions only" to "run-only or a run is attached": for each live record with `record.run` or `record.runOnly`, abort the run and `trackShutdown` its session. A live tab session that is idle keeps today's behavior and waits for reattach; an idle run-only session is still shut down. No loop survives a loss, and none is resumed on reattach.
  - A frame already queued before the drop can arrive after reattach: `RemotePeer.emit` queues frames while detached (`src/remote/serve-detach.ts:76-95`) and replays them on attach (`:162-168`). Nothing produced after the abort is queued, and subplan 21 releases the local run on the same loss, so a replayed frame cannot restart or re-enter it.
- **Fatal connection error — decides subplan 19's open question.** `open`'s connection-level `onError` (`src/remote/serve-acp.ts:80-82`) sends the fatal `acp-error` as today. After sending, if the record is still live and holds a run, call `abort()` and clear `record.run`. No run-end is sent; the fatal frame is the session's terminal signal, and the `control.release` that follows the connection error cannot produce a loop frame because the guard suppresses it. The record stays live with no run, which is today's live-record shape; a later `run` is admitted but fails through the closed control, and the local side's `acp-close` tears the record down. Cover this case rather than defer it: when the agent dies between turns with a caller request pending, nothing else can settle that promise, and the record would keep refusing a new run as "already running" forever. This supersedes subplan 19's "out of scope: keeps today's live-record behavior".
- **Session type.** `startRemoteLoop`'s first parameter changes from `AcpLoopSession` (`src/acp/types.ts:71-73`) to `AcpSession` (`:10-16`), because the handle now calls `cancel`; an `AcpSession` satisfies the narrower type, so `driveToolLoop` and `runAcpToolLoop` keep `AcpLoopSession`. `RemoteAcp` already passes the record's `AcpSession`, so no production call site changes.
- **Module.** All abort, drop, and frame-guard logic stays in `src/remote/serve-acp-loop.ts`; `src/remote/serve-acp.ts` keeps the record lookups and calls the handle, the same split it already uses for the terminal-watching `send` wrapper at `:115-122`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's cancel, close, dispose, and run-only detach | `RemoteAcp.cancel`, `close`, `dispose`, `detachRuns`, `trackShutdown` in `src/remote/serve-acp.ts:130-208` |
| Transport-loss entry point | `RemoteServer.detach` in `src/remote/serve.ts:243-248` |
| Run handle and pending map | `startRemoteLoop`, `RemoteLoopHandle` in `src/remote/serve-acp-loop.ts:10-81` (subplans 18 and 19) |
| Terminal-frame clearing | the `send` wrapper inside `RemoteAcp.run`, `src/remote/serve-acp.ts:115-122` |
| Provider-turn cancellation that settles after the turn | `AcpSession.cancel` in `src/acp/index.ts:176-178`; `AcpPromptControl.cancel` in `src/acp/prompt-control.ts:49-61` |
| Silent swallowing of an aborted caller request | `settleUnlessAborted` and `dropLateRejection` in `src/acp/drive-loop.ts:27-38` |
| Loop signal checks | `runAcpToolLoop` in `src/acp/loop.ts:27`, `:37`, `:43`, `:62` |
| Cancellation terminal frame and reason | `acp-run-end` in `src/remote/protocol-frames.ts:272-275` |
| Test fakes | `acpMock` in `src/remote/serve-acp.test.ts:11-23`; `makeSession` in `src/remote/serve-acp-loop.test.ts:26-39` |

## Proposed changes

- `src/remote/serve-acp-loop.ts`: `RemoteLoopHandle.cancel` and `.abort`, the pending-request rejection, the signal guards, and the `AcpSession` parameter. About 30 lines; the file is about 73 effective lines now, so it stays well under the 200-line limit and needs no extraction.
- `src/remote/serve-acp.ts`: the run branches in `cancel`, `close`, `dispose`, and `detachRuns`, plus the fatal `onError` abort. About 12 lines; the file is about 172 effective lines now, so it stays under 200 and needs no new module. Reuse `trackShutdown` and `stopSession`; do not add a second shutdown path.
- `src/remote/serve.ts`: no change; `detach` already calls `detachRuns`.

## Tests

`src/remote/serve-acp-loop.test.ts` — extend `makeSession` at `:26-39` with `cancel`, `kill`, and `shutdown`, and add a hold-and-drive helper that keeps the last `PromptHandlers` and a deferred `cancel`:
- cancel during a turn, called twice: no frame until the fake `cancel` promise settles; then exactly one `acp-run-end cancelled`; a later `onEnd`, `onChunk`, and `onError` send nothing and start no second prompt.
- cancel with a pending caller request: one `acp-run-end cancelled` after a flush, no second prompt, and a late `toolResult` changes nothing.
- abort with a pending caller request: no frame at all, no second prompt, and a later provider error sends nothing.
- cancel whose provider cancel rejects: the returned promise rejects and no `acp-run-end` is sent.

`src/remote/serve-acp.test.ts` — the fake at `:11-23` already returns a `cancel`, and `makeAcp` records frames at `:34-38`:
- cancel during a run: `acpMock.cancel` returns a deferred; `acp.cancel` sends nothing until it resolves; then one `acp-run-end cancelled`; a later `lastHandlers().onEnd('cancelled')` adds no `acp-turn` and starts no second prompt.
- cancel between turns with a pending caller request: run-end at once after a flush; a late `acp.toolResult` adds nothing and no follow-up prompt is issued.
- failed provider cancel during a run: `ACP: cancellation failed: write failed` as fatal, no run-end, and a second `run` is admitted because the handle was cleared. Keep the existing no-run rejection test at `:207-214` as its no-run equivalent.
- close during a run: no run-end and no `acp-error`; `acp-closed` with `released: true`; a late result is ignored; `acpMock.cancel` is not called.
- dispose during a run: no frame after the call, `shutdown` once, and `cancel` not called.
- `detachRuns` with one running tab session, one idle tab session, and one idle run-only session: the running and run-only sessions shut down, while the idle tab stays live and can still prompt.
- fatal connection error during a run with a pending request: only the fatal `acp-error`, a late result ignored, and a second run admitted because the handle was cleared.
- Keep the existing cancel-with-no-run test at `:190-205` green; it covers the unchanged branch. The existing detach test at `:555-566` covers the idle run-only half.

## Out of scope

The local side's drain, late-result discipline, and release on transport loss (subplans 21 and 22). Replaying or resuming a loop across a transport loss. The legacy `acp-prompt` path, which keeps working until subplan 25. Removing `acp-end` or changing the protocol. No source change outside the two files above.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. No manual end-to-end check is possible yet: no production code sends `acp-run` until subplan 23, so the tests above are the whole observable surface. Confirm `src/remote/serve-acp-loop.ts` and `src/remote/serve-acp.ts` stay under 200 effective lines.
