# Defer, rather than discard, a harness escalation that fires while its tab is on screen

**Complexity: 4/10** — one function in `src/harness/idle-notification.ts` changes its fire-time branch from "discard" to "re-check shortly" for one of its ineligibility reasons, reusing the existing pending map so every existing cancel and release path still reaches the re-armed timer. Two specs, the pull request description, and one test file follow.

When a harness escalation's thirty seconds run out, `escalate` re-asks `isUnreadEligible` and silently drops the escalation for good if the tab is the active tab or the other pane's visible selection. The badge on an active tab only comes off after a completed three-second dwell, so a user on the tab for under three seconds across the thirty-second mark leaves with the badge still set and no escalation left to announce it — the "badge nobody acts on" this feature exists to remove.

## Goal

An escalation that reaches a tab currently on screen waits rather than dies: it re-checks after `UNREAD_DWELL_MS`. If the user stayed, the dwell has cleared the badge and the `tabs: unread-cleared` signal has cancelled the re-check. If they left with the badge still up, the notification fires then. A tab that is gone, docked into a sidebar, or no longer badged is still discarded.

## Approach

`src/harness/idle-notification.ts`:

1. Extract the timer start from `armHarnessIdleEscalation` into a private `schedule(managers, label, delay)` that sets the `unref`'d timer and records it in `pending`. `armHarnessIdleEscalation` cancels, then schedules with `HARNESS_IDLE_ESCALATION_MS`.
2. In `escalate`, discard when the tab is missing, docked, or no longer badged. When it is still badged but ineligible — which is now only the active-tab or visible-secondary case — schedule a re-check after `UNREAD_DWELL_MS` (imported from `src/tab/dwell.ts`). Otherwise notify as today.

Because the re-check lives in the same `pending` map, `cancelHarnessIdleEscalation`, the `unread-cleared` subscription, `HarnessManager.closeTab`, and `disposeHarnessIdleEscalations` all release it unchanged.

## Implementation steps

1. `src/harness/idle-notification.ts`: `schedule`, and the split fire-time branch, with the header and fire-path comments updated to say the escalation waits for a tab on screen.
2. Tests, below.
3. `product/specs/harness.md` § The idle escalation and `product/specs/notifications.md` § Focus suppression: an escalation reaching a tab the user is on waits for them to leave or for the dwell to clear the badge, instead of being discarded.
4. The pull request description's "What does not notify" row for a tab that becomes active, and its "Two tabs, one glance each" note if it contradicts the new rule.

## Tests

`src/harness/idle-notification.test.ts`, replacing "says nothing for a tab that is the active tab when the grace period runs out" with:

- the tab is active at thirty seconds, so nothing is said then; the user switches away before any dwell completes, and the notification arrives once the re-check runs;
- the tab is active at thirty seconds and its badge is then cleared, as a completed dwell does, so nothing is ever notified.

The end-to-end case in `src/harness/busy-status.test.ts` and every other case in `src/harness/idle-notification.test.ts` must keep passing unchanged.

## Out of scope

- The dwell interval itself and how the dwell is begun (`src/tab/dwell.ts`).
- The docked-tab rule: a badged tab docked into a sidebar is still discarded, since it is on screen permanently and no dwell is ever coming.
- Recording or surfacing discarded escalations.
