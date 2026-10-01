# Make the escalation tests able to fail when the subscription is gone

**Complexity: 2/10** — two teardown lines removed and two test cases added. No production change, and
the behavior under test is already correct; what is wrong is that the tests cannot tell.

The harness idle escalation is cancelled by a `tabs: unread-cleared` event, subscribed at module
scope in `src/harness/idle-notification.ts`. Two of the new test blocks call `messageBus.clear()` in
their `afterEach`, and `MessageBus.clear` drops every listener on the bus — including that
module-scope one. So from the second case in each file onward there is no subscription at all, and
the cancel-by-badge-clear path those cases are named for never runs. They still pass, because the
fire-time check that discards an escalation whose badge has gone catches the same situation by a
different route.

That makes the coverage illusory in the exact direction that matters. Deleting the subscription line
outright leaves every test in both files green, verified before writing this plan. The cancellation
is the load-bearing half of the feature — it is what stops a notification for a harness the user has
already read — and the tests currently certify it without running it.

`MessageBus.clear` is the right tool for a suite that owns every listener on the bus. These two
files no longer do, and both already unsubscribe the listeners they register inside each case, so
the global clear is doing nothing for them except removing a subscriber they did not register.

## Approach

Remove the two `messageBus.clear()` calls, and add a case to each file that can only pass if the
subscription fired. The obvious assertion does not work: re-arming after a clear cannot distinguish
the two routes, because `armHarnessIdleEscalation` cancels any pending escalation for the tab
itself, so a first escalation that survived would be replaced rather than left to fire alongside the
second.

The discriminating shape is to re-raise the badge *after* the clear, behind the fire-time check's
back. With the badge set again, the fire-time check would pass and the escalation would notify — so
if the notification does not arrive, the only thing that can have stopped it is the subscription
that heard the clear.

## Implementation steps

1. **`src/harness/idle-notification.test.ts`** — drop `messageBus.clear()` from the `afterEach`,
   keeping `disposeHarnessIdleEscalations()` and the fake-timer restore. Leave the per-case
   `dispose()` that unsubscribes what each case registered.

2. **`src/harness/idle-notification.test.ts`** — add a case beside "cancels when the badge comes off,
   however it came off": arm, clear the badge through `clearUnreadTab`, set `hasUnread` back to
   `true` directly, advance well past the interval, and assert nothing was recorded. Name the
   re-raise in a comment so the next reader knows it is deliberate rather than a setup mistake.

3. **`src/harness/busy-status.test.ts`** — the same two changes to the new
   `busyStatusHandler idle escalation` block: drop `messageBus.clear()` from its teardown, and add a
   case beside "cancels when the harness goes back to work" that re-raises the badge on the harness
   tab after the busy transition cleared it, then asserts nothing is recorded past the interval. The
   existing `busyStatusHandler state push` block above it subscribes and unsubscribes its own dirty
   counter and is unaffected.

## Tests

Two new cases, one per file. Both are load-bearing in the sense that matters: with the
`messageBus.on('tabs', ...)` line in `src/harness/idle-notification.ts` deleted, they fail; with it
present, they pass. The existing cancel cases are left in place — they are weaker, covering the
ordinary path where the backstop agrees, but they are not wrong and they document the user-facing
sequence.

## Out of scope

- Changing production code. The subscription and the fire-time backstop are both correct and both
  wanted: the backstop is what covers a close, which clears a different tab's badge and so never
  emits for the closing one.
- Removing `messageBus.clear()` from the other suites that call it. `src/tab/dwell.test.ts` and the
  rest import no module with a module-scope subscriber, so the global clear is legitimate there and
  is how those suites isolate the bus.
- Any spec or documentation change. Nothing user-visible changes.

## Verification

`$janissary/scripts/run.mjs check-diff`.

Then prove the new cases can fail: delete the `messageBus.on('tabs', 'unread-cleared', ...)` line from
`src/harness/idle-notification.ts`, run
`npx vitest run --project server src/harness/idle-notification.test.ts src/harness/busy-status.test.ts`,
and confirm the new cases fail. Restore the line and confirm they pass. The `src/remote/pty-session.test.ts`
arming and cancel cases exercise the same path through a different entry point and must keep passing
untouched.
