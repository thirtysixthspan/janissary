# ACP tool loop 10.3 — driver cancellation

**Complexity: 2/10** — ~10 added lines in 1 file, 4 requirements, 3 scenarios (p=4.06)

Run order: piece 3 of 3 of subplan 10 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module.md` (decomposed from it; the Cancellation decision and the two cancellation test bullets). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("One loop driver"; decision 9, driver half). Depends on piece 10.2 (`product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module-2-gate-and-route-driver.md`, implemented) for the private runner `gatedRunner`, `driveToolLoop`, and the `describe('driveToolLoop', …)` tests, which build on piece 10.1 (`product/plans/complete/move-janissarys-acp-tool-loop-10-loop-driver-module-1-core-primer.md`, implemented). Subplan 11 then switches `runCorePrompt` (`src/acp/run-prompt.ts`) to the driver, and subplan 20 adds the far side's abort guard.

A cancelled run must not report a step or an error after its signal aborts. `runAcpToolLoop` already drops a late host result; this piece makes the driver drop a late host rejection too, and pins both with tests.

## Design decisions

- **Cancellation** (source decision 9, driver half). `runAcpToolLoop` already drops a late host *result*: after awaiting `runCommand` it returns without `ranCommand` or a follow-up turn when the signal aborted (`src/acp/loop.ts:62`, `if (dependencies.signal?.aborted) return;`). A late host *rejection* is not dropped by the loop, whose catch calls `h.error(errorText(error))` unconditionally (`src/acp/loop.ts:58`). So the runner wraps a promise result: a rejection that arrives after the signal aborted resolves to an empty string instead, which the loop then discards on that same abort check. A rejection before the abort still rejects and becomes `error`.
- **Where the rejection becomes `''`.** In `src/acp/drive-loop.ts`, not in `src/acp/loop.ts`. Add one module-private helper (name it `dropLateRejection`) that takes the host's `string | Promise<string>` result and the `signal`. A non-promise result is returned as is. A promise result (tested with `instanceof Promise`, the same check `runAcpToolLoop` uses at `src/acp/loop.ts:57`) is returned with a rejection handler attached: when the rejection is handled, if `signal.aborted` is true at that moment the handler resolves to `''`; otherwise it rethrows the same error value unchanged, so the loop's `errorText` yields the host's own message. The abort is read when the rejection arrives, not when the host was called. The fulfilment path is untouched: a late *result* still reaches the loop, which drops it.
- **Wiring.** `gatedRunner` gains a `signal: AbortSignal` parameter (after `remember`), and its last line, `return workspace ? host.runWorkspace(command) : host.runCaller(command);`, passes the host result through `dropLateRejection`. `driveToolLoop` passes its own `signal` to `gatedRunner`, the same signal it already hands `runAcpToolLoop`. `driveToolLoop`'s and `runToolLoop`'s signatures do not change.
- **Only host promises are wrapped.** A synchronous host result, and a refusal (`decision.refusal`, returned synchronously before the host is called), pass through unchanged; a synchronous host or gate throw still propagates as piece 10.2 states, and the loop's catch reports it as `error` whether or not the signal aborted.
- **Provider errors are the consumers' job.** A provider `onError` after the abort still reaches `events.error`; the driver adds no `active()` or abort guard of its own on events. The consumers guard that, the local side through `guardAcpHandlers` (`src/acp/guard-handlers.ts`) and `active()` (subplan 11, as `runCorePrompt` in `src/acp/run-prompt.ts` and `executeAgentRun` in `src/agent/execute.ts` do today), and the far side in its frame mapping (subplan 20).
- **Purity** (shared with pieces 10.1 and 10.2). The wrap uses only the `signal` parameter and needs no new import.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Late-result drop on abort; the unconditional `error` in the catch; the `instanceof Promise` check | `runAcpToolLoop` in `src/acp/loop.ts` (lines ~55–63) |
| The runner and host routing | `gatedRunner` in `src/acp/drive-loop.ts` (piece 10.2) |
| Scripted synchronous fake session, recording handlers, `ofKind`, `QUERY`, `coreSnapshot` | `makeSession`, `makeHandlers`, `ofKind`, `QUERY`, `coreSnapshot` in `src/acp/drive-loop.test.ts` |
| A hand-settled host promise | `Promise.withResolvers<string>()`, as in the "waits for a human answer" test in `src/acp/loop.test.ts` |
| A macrotask flush for asserting that nothing happened | `new Promise((r) => setTimeout(r, 0))`, as the local `flush` in `src/controller.test.ts` |

## Proposed changes

One commit, green on its own.

- `src/acp/drive-loop.ts` (74 lines today): add `dropLateRejection`, add the `signal` parameter to `gatedRunner`, route the host result through the helper, and pass `signal` from `driveToolLoop`. About ten lines; the file stays well under the 200-line limit. `src/acp/loop.ts` does not change.

## Tests

Extend the existing `describe('driveToolLoop', …)` block in `src/acp/drive-loop.test.ts`. Add a module-level helper beside `drive` (name it `drivePending`) that builds a `makeSession([QUERY, 'Done.'])` session, `makeHandlers()`, an `AbortController`, a `Promise.withResolvers<string>()` pending result, and a host whose `runCaller` is `vi.fn(() => pending.promise)` and whose `runWorkspace` returns `'workspace output'`; it calls `driveToolLoop` with `coreSnapshot('tell', ['db sqlite query'])` and the controller's signal, and returns `sent`, `events`, `host`, the controller, and the pending `resolve` and `reject`. Because the session is synchronous, by the time `driveToolLoop` returns the first turn has ended and `runCaller` has been called once with the promise still pending; each test asserts that before settling.

Make the order deterministic by doing the steps synchronously in the test body: call `controller.abort()` (or not) first, then `resolve`/`reject`, then await. For the two "nothing more happens" cases, await one macrotask flush (a `setTimeout(…, 0)` promise) so the loop's whole microtask chain — the rejection handler, the loop's `await`, and its abort check — has run, then assert the full `events` list equals exactly `['startTurn', true]`, `['chunk', QUERY]`, `['endTurn', '']`, `['startCommand', QUERY, false]`, and that `sent` has length 1. For the positive case, use `vi.waitFor` as `src/acp/loop.test.ts` does. Async tests: mark each `async`.

- aborting while the `runCaller` promise is pending, then resolving it with `'caller output'`, gives no `ranCommand` and no further turn (pins the loop's existing late-result drop through the driver);
- aborting and then rejecting it with `new Error('host failed')` gives no `error` either, and no `ranCommand` or further turn (fails without `dropLateRejection`, so it guards the new behavior);
- rejecting it with `new Error('host failed')` before any abort gives exactly one `['error', 'host failed']` event (await it with `vi.waitFor`), no `ranCommand`, and `sent` length 1.

Leave the existing synchronous `drive` helper and its tests unchanged.

## Out of scope

Guarding provider `onError` after an abort (the consumers: subplan 11 locally, subplan 20 on the far side). Switching `runCorePrompt` to the driver (subplan 11). Changing `runAcpToolLoop` (`src/acp/loop.ts` stays unchanged). Wrapping synchronous throws, or checking the signal before calling the host.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm piece 10.2's driver tests still pass and `git status` shows `src/acp/loop.ts` unchanged. Nothing user-visible changes (no consumer calls `driveToolLoop` until subplan 11), so there is no manual check.
