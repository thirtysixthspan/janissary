# Attach the idle escalation's badge-clear subscription on arm and release it on dispose

**Complexity: 3/10** — one module's subscription moves from import time to first use, with a matching release in the dispose it already has; two test files drop the workaround they carried for the old shape.

`src/harness/idle-notification.ts` subscribes to `tabs: unread-cleared` once, at module import, and never again. `ControllerCore.shutdown` (`src/controller.ts`) calls `messageBus.clear()` after disposing every manager, so after any clear the subscription is gone for the life of the process: an escalation armed afterwards can no longer be cancelled by a badge clear, leaving only the fire-time `hasUnread` backstop. The plan this pull request carries (`product/plans/complete/harness-idle-notification.md`) states that `dispose()` unsubscribes; the code does not. Both test files that exercise the escalation carry comments forbidding `messageBus.clear()` in their teardown because of it.

## Goal

The subscription's lifetime is the module's own: attached by the first `armHarnessIdleEscalation` while none is held, released by `disposeHarnessIdleEscalations`. `HarnessManager.dispose` runs inside `MANAGER_DISPOSE_ORDER` before `shutdown` clears the bus, so a later arm in the same process re-subscribes cleanly, and tests may clear the bus after disposing.

## Approach

`src/harness/idle-notification.ts`:

1. Replace the bare module-scope `messageBus.on(...)` with a module-level `subscription: Subscription | undefined` (`Subscription` from `src/bus.ts`).
2. `armHarnessIdleEscalation` attaches it when undefined, before scheduling.
3. `disposeHarnessIdleEscalations` unsubscribes and resets it to undefined after clearing the pending timers.
4. Update the trailing comment that explained the module-scope subscription to describe the arm/dispose lifetime.

## Implementation steps

1. The module change above.
2. `src/harness/idle-notification.test.ts` and the `busyStatusHandler idle escalation` block of `src/harness/busy-status.test.ts`: keep `disposeHarnessIdleEscalations()` in `afterEach`, follow it with `messageBus.clear()`, and replace the comments forbidding the clear.
3. The new test below.

## Tests

- `src/harness/idle-notification.test.ts` — after a dispose and a `messageBus.clear()`, a fresh arm is still cancelled by a badge clear: arm, clear the badge through `clearUnreadTab`, put the badge back behind the signal's back, and assert nothing is notified at thirty seconds. Without the re-subscribe this notifies, because the badge is up and nothing cancelled the timer.

The existing "cancels on the badge-clear signal even when the badge comes back" case must keep passing, and must still fail if the subscription is removed.

## Out of scope

- Moving the pending map itself to another owner (a separate backlog entry).
- Any change to `messageBus.clear()` or `ControllerCore.shutdown`.
- No spec or user documentation change: behavior visible to a user does not change.
