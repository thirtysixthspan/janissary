<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that clicking the toast focuses the waiting harness tab, which the toast path does not do.

Existing Issue: The description says "Clicking the feed line or the toast focuses the tab" and its manual step 2 says "Clicking either focuses the tab", and the plan's product decision 8 says the toast links back to the tab, but the toast `deliverNotification` emits carries only `from`, `message` and `color`, and `ToastStack` answers a click with `revealNotifications`, so a toast click opens the feed rather than the tab. Severity: 4/10

Existing Risk: 4/10 - A reviewer or manual tester following step 2 sees the toast open the feed, records a bug against correct code or approves a promise the change does not keep, and the plan's record of what shipped is wrong for whoever extends the toast next.

Proposal Risk: 1/10 - A wording correction in the description and the plan, leaving behavior unchanged, so the only residual hazard is the two statements drifting again.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: correct the description and plan claim that a harness-idle toast click focuses the tab". The toast emitted by `deliverNotification` in `src/notifications/deliver.ts` has no `openTab` field (see the `toast` member of `NotificationsEvent` in `src/bus.ts`), and `web/src/toasts/ToastStack.tsx` sends `revealNotifications` on click, so the toast reaches the tab only by revealing the feed, whose line carries the `openTab` link. Rewrite the pull request description's sentence "Clicking the feed line or the toast focuses the tab" and manual verification step 2 to say the feed line's link focuses the tab and a toast click reveals the feed where that line is; and amend product decision 8 in `product/plans/complete/harness-idle-notification.md`, which says the line and the toast both link back, to the same effect. Do not add a link to toasts here — that is a wire change to every toast and belongs to its own plan. `product/specs/notifications.md` already describes only the line as a link and needs no change; confirm `documentation/user-documentation/tab-types/notifications.md` likewise only promises the feed's link.


* Deliver the plan's notification test that pins the new event as explicit, firing with no configuration.

Existing Issue: The plan's tests section requires `src/notifications/index.test.ts` to show that `harness-idle` is in `EXPLICIT_EVENTS` and that `shouldNotify` returns it true with no config present, but the diff adds only a feed-line link case, so the "works with no setup" property the plan's classification decision rests on is untested. Severity: 2/10

Existing Risk: 2/10 - A later edit that moves `harness-idle` behind a toggle would leave the feature silently inert for default configs with no test going red.

Proposal Risk: 1/10 - A few assertions in an existing suite, whose only hazard is a test pinning the wrong expectation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1500: add the planned shouldNotify test for harness-idle". In `src/notifications/index.test.ts`, add a `describe` block beside the other explicit-event blocks asserting `EXPLICIT_EVENTS['harness-idle']` is true, that `shouldNotify` (from `src/notifications/index.ts`) returns true for `harness-idle` with an undefined config and with every ambient toggle off, that it fires when the tab is the active one, and that it never targets the notifications tab itself, matching the shape of the existing `question` and `plugin-note` blocks. No production code changes; the existing format and line-composition cases must keep passing.
