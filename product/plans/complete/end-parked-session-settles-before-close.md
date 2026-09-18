# End a parked session: settle the outcome before the channel's teardown speaks

**Complexity: 3/10** — a two-line reordering inside one handler plus a new colocated test file that fakes `managers.remote`. No protocol, store, or UI surface changes; `src/sessions/actions.ts` and `src/sessions/manager.test.ts` are untouched.

## Goal

Per the PR backlog entry: "Handle the empty-peer end action's accepted-reattach bookkeeping, which today resolves a successful end as a failure and keeps its record."

An end attempt on a parked session reattaches far enough to send `shutdown`. The accepted branch of `endParkedSession` in `src/sessions/end-session.ts` calls `RemoteManager.close(label)` before its own `finish({ ended: true })` — but `close` runs the launch handlers' `onClosed` sweep synchronously (`src/remote/manager.ts:195-203`, handlers returned by `terminateRemoteEntry` at `src/remote/reattach.ts:187-189`), and the end channel's own handler is registered on that entry. So `onClosed` settles the promise first with `{ ended: false, reason: 'The connection to <host> closed.' }`, the success branch never fires, and `end` in `src/sessions/actions.ts:151` applies a failure — the user sees the row stay failed, the record survive, and retries against an already-dead peer.

## Verified starting facts

- `RemoteManager.close` synchronously calls every handler's `onClosed` (`manager.ts:200`) — confirmed.
- `handleReattachResult` calls `resume.onResult(accepted)` before `terminateRemoteEntry` on the refused path (`resume.ts:74-80`), so a refused reattach already reports `{ ended: true }` — only the accepted path is broken.
- The `settled` flag in `endParkedSession` already makes `finish` idempotent, so the fix is pure ordering, not a new flag.
- `actions.ts`'s `end` reads only the outcome — record drop, row transition, and notification all key off `outcome.ended`.

## Approach

**Settle before closing.** In the `onResult` handler of `endParkedSession`, call `finish({ ended: true })` first, then `if (accepted) managers.remote.close(label)`. The `onClosed` fired by `close` becomes a no-op because `settled` is already true. The shutdown frames still go out: `close`'s work (`terminateRemoteEntry` sends them, the entry is dropped) is unchanged and remains synchronous.

## Implementation steps

1. In `src/sessions/end-session.ts`, reorder the `onResult` accepted branch: `finish({ ended: true })` before `managers.remote.close(label)`. Update the block comment to say the outcome is settled before the explicit close's `onClosed` sweep can speak.
2. Verify nothing else in the function can re-resolve after settlement (the other `finish` call sites already guard on `settled`).

## Out of scope

- `src/sessions/manager.test.ts` — its `end` cases mock `endParkedSession` wholesale and must keep passing untouched.
- Any change to `RemoteManager.close`, `terminateRemoteEntry`, or `resume.ts`.
- Spec and docs updates: the behavior after the fix is what the specs already describe (a successful end ends the session); no behavior they document changes.

## Tests

New colocated `src/sessions/end-session.test.ts` (the file ships with none — why this shipped). Style mirrors `src/remote/resume.test.ts`: fake `managers` objects, no module mocks. `managers.remote` is faked with an `open` that records the launch handlers and resume object, plus a `close` that — like the real `RemoteManager.close` — synchronously invokes the registered launch handlers' `onClosed`:

1. **Accepted reattach resolves `{ ended: true }`**: drive `resume.onResult(true)` with a fake `close` that fires `onClosed`; assert the resolved outcome is `{ ended: true }` and that `close` was called with the end label.
2. **Refused reattach resolves `{ ended: true }`**: drive `resume.onResult(false)`; assert `{ ended: true }` and that `close` was never called.
3. **Launch failure stays a failure**: drive the launch handlers' `onFailed`; assert `{ ended: false, reason: message }`.
4. **Connection lost before an answer stays a failure**: drive `onClosed` without any `onResult`; assert `{ ended: false }` with the connection-closed reason.
5. **Unparseable address stays a failure**: a record whose `address` fails `parseRemoteAddress` resolves `{ ended: false }` and never opens a channel.
