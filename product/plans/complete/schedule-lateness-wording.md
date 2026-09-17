# Attribute schedule lateness correctly instead of always blaming sleep

**Complexity: 4/10** — one subscription, one instant tracked, a branch on an existing string, and spec wording updated in three files.

PR 1131 backlog item: *"Say why a scheduled command was late instead of asserting that the system was asleep."*

`ScheduleManager.fireDue` raises `schedule-late` with the fixed line `<command> ran <duration> late (system was asleep)` for any delivery more than `SCHEDULE_LATE_THRESHOLD_MS` (5000ms) past its due time, with no check that the machine actually slept. Several non-sleep paths already leave an entry due past its `nextRun` — a harness tab not yet `running`, the one-entry-per-tick budget holding a second overdue command back, an agent tab busy with a queued command, and the `tab.remote && !channel.attached` guard — so a command delayed by any of those, once it finally fires, is reported as caused by sleep regardless.

## Design decision

**Attribute lateness to sleep only when a resume happened after the entry became due.** `ScheduleManager` already imports `messageBus`; it subscribes to the `system` channel's `resumed` event (the same signal `src/index.ts` and `src/remote/reattach.ts` already consume) and records the wall-clock instant of the most recent one. In `fireDue`, a late entry is attributed to sleep only when its `nextRun` fell before that recorded instant — meaning the entry was already overdue at the moment the machine woke, so sleep is a plausible cause. Otherwise the same duration is reported with a neutral clause, `<command> ran <duration> late`, dropping the parenthetical rather than asserting a cause that was not observed. No new plumbing beyond the subscription: `fireDue` already holds both `now` and `e.nextRun`.

## Proposed changes

- **`src/schedule/manager.ts`** — add a `private lastResume = 0` field and a subscription taken in the constructor (`messageBus.on('system', 'resumed', () => { this.lastResume = Date.now(); })`), stored and unsubscribed in `stop()` alongside the existing timer teardown. In `fireDue`, change the `schedule-late` branch to check `e.nextRun < this.lastResume` and choose between the two wordings.

## Spec

- **`product/specs/scheduling.md`** and **`product/specs/notifications.md`** — the `schedule-late` line currently states only the sleep-attributed wording; add the neutral form and the rule for which applies.
- **`product/specs/sleep-and-resume.md`** — the "Overdue commands" section states the line unconditionally; add the same distinction.

## Tests

- `src/schedule/manager.test.ts` — extend the existing lateness cases: the current `fires each overdue entry once, reports lateness, and schedules recurrence from now` case fires with no preceding `resumed` event, so update its expected notification text to the neutral form (`help ran 1m late`) unless the test is restructured to emit `resumed` first — either way, add one case that emits `messageBus.emit('system', { type: 'resumed', sleptMs: ... })` before firing an overdue entry and asserts the sleep-attributed wording, and confirms the existing `does not report an on-time command as late` case is unaffected by the subscription's presence. Unsubscribe cleanup is exercised implicitly by the suite's existing `manager.stop()` calls; no separate case is needed since nothing observable distinguishes a leaked subscription from a released one within one test file's lifetime.
- `src/schedule/index.test.ts`'s `formatLateDuration` cases are unaffected — the duration formatting is unchanged, only the surrounding sentence.

## Out of scope

- Any change to the threshold value itself (`SCHEDULE_LATE_THRESHOLD_MS`, 5000ms) or to `RESUME_THRESHOLD_MS` — both were addressed in the prior backlog fix that decoupled them.

## Verification

```
$janissary/scripts/run.mjs check-diff
```
