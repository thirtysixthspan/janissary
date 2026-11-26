# Skip paused entries in startup recovery and share future-run math

**Complexity: 3/10** — ~20 added lines across 2 files, 5 requirements, 5 recovery scenarios (p=4.651)

## Goal

Make a paused system schedule inert across a restart and give resume an occurrence calculation it can share with recovery. Today startup recovery treats every entry whose `nextRun` is at or before the cutoff as missed, deletes missed one-shots, and advances missed recurring entries. This change lifts that advance loop into a pure helper and makes recovery pass paused entries through untouched, so a paused schedule neither fires nor reports as missed and keeps its stored next-run time. Resume will use the same helper in the next subplan.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-1-store-v2-format.md` for the `paused` field.

## Requirements

1. "The paused state survives an application restart" (`suspend one timer through a maintenance window or restart`). The store keeps the flag (subplan 1); this subplan makes recovery leave the entry and its flag untouched.
2. "Startup recovery does not report a paused schedule as missed" (`pause state must also apply during startup recovery`).
3. "Startup recovery does not advance or remove a paused schedule" (`pause state must also apply during startup recovery`).
4. "A resumed schedule next runs at its first occurrence strictly after the moment of resuming" (`pick up at its next future occurrence`). This subplan delivers the pure helper that resume calls; the manager wiring lands in the next subplan.
5. "Resuming never runs the occurrences that fell inside the paused period" (`pick up at its next future occurrence`). The helper returns a time strictly after `now`, so no past occurrence is replayed.

## Design decisions

- The `while (nextRun <= cutoff)` advance loop in `recoverSystemSchedules` moves unchanged into a pure `nextFutureRun(entry, now)` in `src/schedule/time.ts`, beside `computeNextRun`. Both recovery and resume call it, so they cannot disagree, and a stale stored `nextRun` cannot trigger an immediate catch-up run.
- The interval branch advances from `now`, matching `computeNextRun`'s existing interval rule (`src/schedule/time.ts:27` `if (entry.intervalMs) return now.getTime() + entry.intervalMs;`), so the recovered `nextRun` for an active entry is unchanged by this refactor.
- `nextFutureRun` returns the first occurrence strictly greater than `now.getTime()`. For an interval entry it advances from `now`, not from the stale `nextRun`; for a clock-time entry it advances `computeNextRun` until the result is past `now`.
- Recovery filters paused entries out of the `missed` list and returns them unchanged in `entries`, preserving their key, flag, and stale `nextRun`. Active entries keep today's behavior exactly, including the "exact cutoff is missed" boundary and the loop that skips several missed intervals in one pass.
- A paused entry's stored `nextRun` stays a finite number while paused. Nothing reads it until resume replaces it, which avoids the immediate catch-up that an unsuspend with a stale time would cause.

## Preserved behavior

1. Startup recovery reports overdue active entries as missed, removes missed one-shots, and advances missed recurring entries past the cutoff. Skipping paused entries must not stop an active entry from being reported, removed, or advanced. Pinned by `src/schedule/system/boot-recovery.test.ts` › `treats the exact cutoff as missed, removes one-shots, and advances recurrence beyond it`.
2. Recovery skips repeated missed interval occurrences in one pass. Moving the advance loop into `nextFutureRun` must not change the recovered `nextRun`. Pinned by `src/schedule/system/boot-recovery.test.ts` › `skips repeated missed interval occurrences in one recovery`.

## Assumptions

1. Startup recovery advances a missed recurring entry until it is past the cutoff: `src/schedule/system/boot-recovery.ts:14` `while (nextRun <= cutoff) nextRun = computeNextRun(entry, new Date(nextRun));`.
2. Next-occurrence math for interval, daily, and weekday recurrences lives in one pure module: `src/schedule/time.ts:26` `export function computeNextRun(entry: ScheduleEntry, now: Date): number {`.
3. A paused entry is marked with an optional `paused?: true` on the shared entry shape, added by `pause-recurring-system-schedules-1-store-v2-format.md`.
4. Recovery is called with one captured cutoff during startup: `src/schedule/system/boot-recovery.ts:4` `export function recoverSystemSchedules(entries: SystemScheduleEntry[], cutoff: number): {`.

## Existing functionality

1. `computeNextRun` already answers the next occurrence for interval, time-of-day, and weekday recurrences: `src/schedule/time.ts:26` `export function computeNextRun(entry: ScheduleEntry, now: Date): number {`.
2. `recoverSystemSchedules` already separates missed entries from recovered ones in one pass: `src/schedule/system/boot-recovery.ts:4` `export function recoverSystemSchedules(entries: SystemScheduleEntry[], cutoff: number): {`.
3. Existing `computeNextRun` tests live in `src/schedule/index.test.ts`; there is no `time.test.ts`, so the new helper's tests go beside them.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add `nextFutureRun` to `src/schedule/time.ts` as a pure function taking a `ScheduleEntry` and a `now: Date`. For an interval entry, return `now.getTime() + intervalMs` so the result is strictly after `now`. For a clock-time entry, start from `computeNextRun(entry, now)` and advance with the existing `computeNextRun` loop until the result is strictly greater than `now.getTime()`. Export it from that module only; do not add a barrel.
2. Change `recoverSystemSchedules` in `src/schedule/system/boot-recovery.ts`. Build `missed` only from entries that are not paused and whose `nextRun <= cutoff`. For a missed recurring active entry, set `nextRun` from `nextFutureRun(entry, new Date(cutoff))` instead of the inline loop. For a paused entry, return the entry object itself in `entries` (`[entry]`), not a copy, and never add it to `missed`, so its key, flag, and stale `nextRun` are all untouched. Keep missed one-shot removal and every non-missed passthrough identical.
3. Add tests. In `src/schedule/index.test.ts`, beside the existing `computeNextRun` tests, assert `nextFutureRun` returns a time strictly after `now` for an interval entry and for daily and weekday entries whose stored `nextRun` is far in the past, and that it returns the first such occurrence rather than a later one. In `src/schedule/system/boot-recovery.test.ts`, add a case with an overdue paused entry beside an overdue active entry: the paused entry is neither missed, advanced, nor removed, while the active one still is. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan changes server-side startup behavior and adds a pure helper; it adds or changes no user-visible surface. The paused row a user sees is delivered by a later subplan.

## Tests

- `src/schedule/index.test.ts`: `nextFutureRun` returns the first occurrence strictly after `now` for interval, daily, and weekday entries whose stored `nextRun` is far in the past (Requirements 4 and 5).
- `src/schedule/system/boot-recovery.test.ts`: an overdue paused entry is neither missed, advanced, nor removed, while an overdue active entry beside it still is (Requirements 2 and 3; Preserved behavior 1 and 2).
- `src/schedule/system/boot-recovery.test.ts` existing cases still pin the exact-cutoff boundary and repeated missed-interval skipping (Preserved behavior 1 and 2).

## Out of scope

- No pause or resume manager operations and no commands; resume calls this helper but is wired in the next subplan.
- No change to how the store persists the flag, to notices, to commands, or to the wire format.
- No change to `computeNextRun` or to any parser.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check: hand-edit a scratch project's `.janissary/system-schedules.json` so one recurring entry has `"paused": true`, `"version": 2`, and a `nextRun` well in the past, and a second active entry is likewise overdue. Relaunch the app. No `missed its run` notice appears for the paused entry, the active entry does report as missed and advances, and reading the store back shows the paused entry's `nextRun` unchanged and its `paused` flag intact.
