# ACP tool loop 10.3 — driver cancellation

**Complexity: 2/10** — ~6 added lines in 1 file, 4 requirements, 3 scenarios (p=3.96)

Run order: piece 3 of 3 of subplan 10 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module.md` (decomposed from it; the Cancellation decision). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decision 9, driver half). Depends on piece 10.2 (`product/plans/draft/move-janissarys-acp-tool-loop-10-loop-driver-module-2-gate-and-route-driver.md`) for the runner, `driveToolLoop`, and its tests, which build on piece 10.1 (`product/plans/draft/move-janissarys-acp-tool-loop-10-loop-driver-module-1-core-primer.md`). Subplan 11 then switches `runCorePrompt` to the driver, and subplan 20 adds the far side's abort guard.

A cancelled run must not report a step or an error after its signal aborts. `runAcpToolLoop` already drops a late host result; this piece makes the driver drop a late host rejection too, and pins both with tests.

## Design decisions

- **Cancellation** (source decision 9, driver half). `runAcpToolLoop` already drops a late host *result*: after awaiting `runCommand` it returns without `ranCommand` or a follow-up turn when the signal aborted. A late host *rejection* is not dropped by the loop, whose catch calls `error` unconditionally. So the runner wraps a promise result: a rejection that arrives after the signal aborted resolves to an empty string instead, which the loop then discards on its abort check. A rejection before the abort still rejects and becomes `error`.
- **Only host promises are wrapped.** A synchronous host result, and a refusal (which returns its text synchronously), pass through unchanged; a synchronous gate throw still propagates as piece 10.2 states.
- **Provider errors are the consumers' job.** A provider `onError` after the abort still reaches `events.error`; the driver adds no `active()` or abort guard of its own on events. The consumers guard that, the local side through `guardAcpHandlers` and `active()` (subplan 11, as `runCorePrompt` and `executeAgentRun` do today), and the far side in its frame mapping (subplan 20).
- **Purity** (shared with pieces 10.1 and 10.2). The wrap uses only the `signal` parameter and needs no new import.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Late-result drop on abort; the unconditional `error` in the catch | `runAcpToolLoop` in `src/acp/loop.ts` |
| The runner and host routing | the runner in `src/acp/drive-loop.ts` (piece 10.2) |
| Scripted fake session, recording host and handlers | `src/acp/drive-loop.test.ts` (pieces 10.1 and 10.2) |

## Proposed changes

One commit, green on its own.

- `src/acp/drive-loop.ts`: in the runner's host-routing step, wrap a promise result so a rejection after `signal.aborted` resolves to `''`, and a rejection before it rejects unchanged. A few lines, in the runner or a small module-private helper; the file stays well under the 200-line limit.

## Tests

Extend `src/acp/drive-loop.test.ts`, with a `runCaller` host function that returns a promise the test settles by hand:

- aborting while a `runCaller` promise is pending, then resolving it, gives no `ranCommand` and no further turn;
- aborting and then rejecting it gives no `error` either (and no `ranCommand` or further turn);
- a rejecting host before any abort gives the `error` event with the rejection text and no `ranCommand`.

## Out of scope

Guarding provider `onError` after an abort (the consumers: subplan 11 locally, subplan 20 on the far side). Switching `runCorePrompt` to the driver (subplan 11). Changing `runAcpToolLoop` (`src/acp/loop.ts` stays unchanged).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm piece 10.2's driver tests still pass and `src/acp/loop.ts` is unchanged. Nothing user-visible changes, so there is no manual check.
