# Correct the claim that a harness-idle toast click focuses the waiting tab

**Complexity: 1/10** — a wording correction in the pull request description and in one product decision of this pull request's plan; no code, test, or spec change.

The pull request description says "Clicking the feed line or the toast focuses the tab", and its manual verification step 2 says "Clicking either focuses the tab". Product decision 8 in `product/plans/complete/harness-idle-notification.md` says the line and the toast both link back to the tab. The toast `deliverNotification` emits (`src/notifications/deliver.ts`) carries only `from`, `message` and `color` — the `toast` member of `NotificationsEvent` in `src/bus.ts` has no link field — and `web/src/toasts/ToastStack.tsx` answers a click with `revealNotifications`. A toast click therefore opens the feed, and it is the feed line's `openTab` link that focuses the tab.

## Goal

The description and the plan say what ships: the feed line links to the tab, and a toast click reveals the feed where that line is.

## Implementation steps

1. `product/plans/complete/harness-idle-notification.md`, product decision 8: say the feed line links back to the tab, and a toast click reveals the feed where that line is.
2. After the push, the pull request description: rewrite "Clicking the feed line or the toast focuses the tab" and manual step 2's "Clicking either focuses the tab" to the same effect, leaving every other paragraph untouched.
3. Confirm `product/specs/notifications.md` describes only the line as a link (it does) and `documentation/user-documentation/tab-types/notifications.md` promises only the feed's link (it does).

## Tests

None — no behavior changes.

## Out of scope

- Adding a link to toasts. That is a change to the toast wire shape for every event and belongs to its own plan.
