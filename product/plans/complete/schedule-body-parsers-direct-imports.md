# Have the schedule-body parsers import their helpers and share one usage string

**Complexity: 3/10** — two small parser modules change signature, one new constant module, one type moves into `types.ts`, the only production caller drops its injected arguments, and one test file is rewritten against the real helpers. No wire, client, or command change.

When the `at`/`on`/`every` parsers were split out of `src/schedule/index.ts` to satisfy the line limit, they were handed their collaborators as function parameters instead of importing them. `parseAtSchedule` in `src/schedule/helpers.ts` takes five parameters, `parseOnSchedule` six, and `parseEverySchedule` in `src/schedule/every-schedule.ts` seven. The only production caller, `parseScheduleBody` in `src/schedule/index.ts`, passes the real functions from `src/schedule/parsing.ts`, `src/schedule/time.ts`, and `src/schedule/display.ts`, none of which import `index.ts`, so the injection avoids no cycle.

The split also left copies behind, and they have drifted:

- `helpers.ts` re-declares `MONTHS`, which `parsing.ts` already exports.
- `ScheduleBodyResult` is declared once in `helpers.ts` (exported) and again privately in `index.ts`.
- `every-schedule.ts` declares its own `SCHEDULE_USAGE` without the `[in TAB]` clauses, so `schedule standup every monday report` (a weekday form missing `at`) answers with a usage line that omits the tab clause the rest of the command documents.

And because `src/schedule/helpers.test.ts` feeds the parsers stubs (every time parses to 14:30, every next-run is 42), a regression in how a parser combines the real time, date, and formatting helpers passes its unit tests.

## Goal

Each schedule-body parser takes `(tokens, now)` and imports the pure helpers it needs. One `SCHEDULE_USAGE`, one `MONTHS`, and one `ScheduleBodyResult` exist in the schedule module, and every malformed form answers with the full usage string. The parser unit tests run against the real helpers and assert real next-run timestamps.

## Approach

- New `src/schedule/usage.ts` exports the canonical `SCHEDULE_USAGE` (moved verbatim from `index.ts`). `index.ts` imports it for its own use and re-exports it, so any importer of `./index.js` keeps working. `every-schedule.ts` imports it from `usage.ts`, not from `index.ts`, which would create a cycle (`index.ts` imports the parsers).
- `ScheduleBodyResult` moves to `src/schedule/types.ts` as one exported type; `helpers.ts`, `every-schedule.ts`, and `index.ts` import it from there.
- `helpers.ts` imports `MONTHS`, `parseTimeOfDay`, and `parseMonthDay` from `parsing.ts`, `nextOccurrenceOfTime` and `nextDateTime` from `time.ts`, and `fmtTime` from `display.ts`. `parseAtSchedule` and `parseOnSchedule` become `(tokens, now)`.
- `every-schedule.ts` imports `parseInterval` and `parseTimeOfDay` from `parsing.ts`, `nextOccurrenceOfTime` and `nextWeekday` from `time.ts`, `fmtTime` from `display.ts`, and `SCHEDULE_USAGE` from `usage.ts`. `parseEverySchedule` becomes `(tokens, now)`. Its file comment stays.
- `helpers.ts` drops its `export { parseEverySchedule } from './every-schedule.js'` re-export, and `index.ts` imports `parseEverySchedule` directly from `every-schedule.ts`, per the direct-import guideline.
- `parseScheduleBody` in `index.ts` calls the three parsers with `(tokens, now)` and no longer imports the helpers it only forwarded. Its re-exports of `parseTimeOfDay`, `parseInterval`, `parseMonthDay`, `nextOccurrenceOfTime`, `nextWeekday`, `computeNextRun`, `fmtNextRun`, `formatSchedule`, and `formatLateDuration` stay, since other modules and tests import them through `index.js`.

The only user-visible change is the usage line a malformed `every <day>` form returns, which now includes the `[in TAB]` clauses.

Rejected alternative: keep the injection and fix only the duplicated constants. The injected parameters exist only to be stubbed in tests, and those stubs are exactly what lets a real regression through, so keeping them keeps the hazard.

## Implementation steps

1. Add `ScheduleBodyResult` to `src/schedule/types.ts`.
2. Add `src/schedule/usage.ts` with `SCHEDULE_USAGE`; in `index.ts`, import and re-export it and delete the local declarations of `SCHEDULE_USAGE` and `ScheduleBodyResult`.
3. Rewrite `helpers.ts` and `every-schedule.ts` to the two-argument forms with direct imports, deleting the local `MONTHS`, `ScheduleBodyResult`, and `SCHEDULE_USAGE` copies and the `parseEverySchedule` re-export.
4. Update `parseScheduleBody` in `index.ts` to the two-argument calls and import `parseEverySchedule` from `every-schedule.ts`.
5. Rewrite `src/schedule/helpers.test.ts`.
6. Update `product/specs/scheduling.md`.

## Tests

`src/schedule/helpers.test.ts` is rewritten to call the two-argument forms with a fixed local `now` (Tuesday June 23 2026, 2:00pm) and assert real specs and next-run timestamps:

- `parseAtSchedule`: invalid time, missing command, a time still ahead today (`at 3pm` → today 3:00pm, spec `at 3:00pm`), and a time already past (`at 1pm` → tomorrow 1:00pm).
- `parseOnSchedule`: invalid date, invalid time after `at`, missing command, the 9:00am default (`on aug 12 backup` → spec `on aug 12 at 9:00am`, next run August 12 2026 9:00am), an explicit time with a numeric date (`on 8/12 at 2:30pm`), and a date already past this year rolling to next year.
- `parseEverySchedule`: an interval (`every 5m` → now + 5 minutes), missing command after an interval, an unknown interval or day, a weekday form missing `at`, an invalid time, a missing command after a weekday form, `every monday at 2pm` (next Monday June 29 2:00pm, weekday 1), `every day at 3pm` (today 3:00pm), and `every day xyz cmd` returning exactly `SCHEDULE_USAGE` with its `[in TAB]` clauses.

`src/schedule/index.test.ts` and `src/commands/schedule.test.ts` pin end-to-end parsing and must pass unchanged.

## Spec

`product/specs/scheduling.md`: state that every malformed schedule form, including a day form missing its `at TIME`, returns the one full usage message, and quote it verbatim.

## Out of scope

- The stale `src/schedule.ts` path in `product/specs/scheduling.md`, which another backlog item (tab-by-alias resolution for `schedule … in <tab>`) already owns.
- Resolving `in <tab>` by alias or case-insensitively.
- The separate `Usage: schedule cancel <name> [in TAB]` message for a bare `cancel`, which is deliberate and already correct.
