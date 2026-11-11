# ACP tool loop 20 — cancelling, closing, and losing a far-side loop

**Complexity: 4/10** — ~50 added lines in 2 files, 8 requirements, 7 scenarios (p=5.23)

Run order: 20 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the cancel, close, and dispose sentences of "Far side"; decisions 9 and 10, far-side halves). Depends on subplan 19 (`move-janissarys-acp-tool-loop-19-far-side-run-wiring.md`). Subplan 21 relies on its `acp-run-end cancelled` as the drain barrier.

Once the far side owns the loop, stopping a prompt has to stop the loop there. Cancelling the provider turn is not enough. Cancellation has to stop the loop from issuing another turn or tool, ignore a caller result that arrives late, and end with one terminal frame the local side can drain on. The same has to happen when the session closes, the server shuts down, or the transport drops.

## Design decisions

- **Cancel** (source decision 9). `RemoteAcp.cancel(id)` on a session with a run in flight:
  - aborts the run's signal;
  - drops every pending caller request, so a late `acp-tool-result` for it is ignored;
  - cancels any in-flight provider turn through `session.cancel()`.
  
  It then sends exactly one `acp-run-end { reason: 'cancelled' }`. That happens once the provider turn has ended, which is when `session.cancel()` settles, or at once when the loop was between turns, for example while it waited on a caller result.
  
  A cancel on a session with no run keeps today's behavior. A failed provider cancellation keeps today's fatal `ACP: cancellation failed: …` error.
- **Nothing after the abort.** The far side's event-to-frame mapping is guarded by the run's signal. A chunk, turn end, step, or non-fatal error that the provider or the loop produces after the abort sends nothing, and `acp-run-end cancelled` is the run's last frame. `runAcpToolLoop` already returns without a follow-up turn once the signal aborts, but its `onError` path is not signal-guarded, so the guard has to live in the mapping.
- **Close and dispose.** `RemoteAcp.close(id)` and `dispose()` abort a run in flight the same way and drop its pending requests before shutting the session down. They send no `acp-run-end`: `acp-closed` remains the session's terminal on close, and on dispose the server is going away.
- **Transport loss** (source decision 10, far-side half). When the transport drops, `RemoteServer.detach` calls `RemoteAcp.detachRuns()`. That call now also aborts every in-flight run and shuts down the session that ran it, the same way it already shuts down a run-only agent session. A session that was idle when the transport dropped keeps today's detach behavior and waits for reattach. A far-side loop is never kept running across a transport loss, and its events are never replayed on reattach.
- **Module.** The abort, drop, and terminal logic lives on the run handle in `src/remote/serve-acp-loop.ts`. `serve-acp.ts` only calls it from `cancel`, `close`, `dispose`, and `detachRuns`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Today's cancel, close, dispose, and run-only detach | `RemoteAcp.cancel`, `close`, `dispose`, `detachRuns`, `trackShutdown` in `src/remote/serve-acp.ts` |
| Transport-loss entry point | `RemoteServer.detach` in `src/remote/serve.ts` |
| Run handle and pending map | `src/remote/serve-acp-loop.ts` (subplans 18 and 19) |

## Proposed changes

- `src/remote/serve-acp-loop.ts`: an `abort` on the run handle that aborts, drops pending requests, and, for a cancel, sends the single `acp-run-end cancelled` at the right moment. Also the signal guard on the frame mapping.
- `src/remote/serve-acp.ts`: call it from `cancel`, `close`, `dispose`, and `detachRuns`, and have `detachRuns` shut down a session whose run was in flight.

## Tests

`src/remote/serve-acp.test.ts`:
- cancel during a provider turn sends `acp-run-end cancelled` only after the fake provider turn ends, and sends no further turn;
- cancel while a caller request is pending sends `acp-run-end cancelled` at once, and a late `acp-tool-result` for that request is ignored;
- a provider error arriving after the cancel sends no `acp-error`;
- a cancel with no run in flight behaves as before;
- close during a run aborts it, sends no `acp-run-end`, and answers `acp-closed`;
- dispose during a run aborts it;
- `detachRuns` during a run aborts the loop and shuts down that session, while an idle tab session stays live.

## Out of scope

The local side's drain and its late-result discipline (subplans 21 and 22). Keeping a loop alive across a transport loss, or replaying loop events on reattach.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes yet.
