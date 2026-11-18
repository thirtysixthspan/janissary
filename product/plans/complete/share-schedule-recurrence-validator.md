# Share one recurrence validator between the schedule parser and the store decoder

**Complexity: 5/10** — ~45 added production lines, 2 existing files edited, 6 behavioral requirements and 20 test scenarios, with 5 new guard functions in one module (`p=5.42`).

## Goal

Define the accepted clock, interval, weekday and recurrence shapes in one module and use them at both the parsing boundary and the persisted-entry decode boundary, so an entry the parser could never create is refused on load. The version gate and the runscript command-string check stay in the store decoder.

## Approach

The grammar of a valid recurring entry is currently spelled out twice. `src/schedule/parsing.ts` `parseTimeOfDay` and `parseInterval` enforce clock and interval rules while turning input tokens into values; `src/schedule/system/store-decode.ts` `validClock`, `hasNoRecurrenceFields` and the interval branch of `validEntry` re-derive the same rules from `Record<string, unknown>` with casts such as `(time.hour as number)`. A change on one side leaves the other validating with stale rules.

Add `src/schedule/validity.ts` with four value-level guards:

- `isValidClock(value): value is TimeOfDay` — a record with safe-integer `hour` 0–23 and `minute` 0–59.
- `isValidIntervalMs(value): boolean` — a finite number greater than zero.
- `isValidWeekday(value): boolean` — a safe integer 0–6.
- `isValidRecurrence(value): boolean` — the exclusivity rule (one of no recurrence fields, a positive interval, or a clock time with an optional weekday), composed from the three guards above.

`parseTimeOfDay` and `parseInterval` run their constructed values through `isValidClock` and `isValidIntervalMs` before returning, so those two rules now live in one place. `validEntry` in `store-decode.ts` drops its local `hasNoRecurrenceFields` and `validClock` helpers and its inline interval branch, and returns `isValidRecurrence(value)` after the store-specific checks. `isValidClock` is a type guard, so the decode path loses its `as number` casts on clock fields. The version gate, duplicate-key check, runscript-name check and `script <name>` command-string check remain exactly where they are.

No user-visible command grammar changes: every value the parser currently accepts is still accepted, and every value the decoder currently rejects is still rejected.

## Implementation steps

1. Add `src/schedule/validity.ts` exporting `isValidClock`, `isValidIntervalMs`, `isValidWeekday` and `isValidRecurrence`. Import `TimeOfDay` from `./types.js` and `isRecord` from `../value-guards.js`. Use `typeof` checks before the `Number.isSafeInteger` / `Number.isFinite` checks so no `as number` casts are needed.
2. In `src/schedule/parsing.ts`, import `isValidClock` and `isValidIntervalMs`; return the constructed time-of-day through `isValidClock` and the constructed millisecond interval through `isValidIntervalMs`.
3. In `src/schedule/system/store-decode.ts`, import `isValidRecurrence` from `../validity.js`; delete `hasNoRecurrenceFields` and `validClock`, and replace the recurrence tail of `validEntry` with `return isValidRecurrence(value)`. Leave the `isRunscriptName(value.script as string)` check and the version gate untouched.
4. Update the spec in `product/specs/scheduling.md`.
5. Add the tests listed below.

## Tests

`src/schedule/validity.test.ts` (new) covers the four guards directly:

- `isValidClock`: accepts `{ hour: 0, minute: 0 }` and `{ hour: 23, minute: 59 }`; rejects hour 24, a negative hour, minute 60, a fractional hour, a string hour, a non-object and a missing minute.
- `isValidIntervalMs`: accepts `60000` and `1`; rejects `0`, `-1`, `Infinity`, `NaN` and a numeric string.
- `isValidWeekday`: accepts `0` and `6`; rejects `-1`, `7`, `1.5` and a numeric string.
- `isValidRecurrence`: accepts a non-recurring value with no recurrence fields; rejects a non-recurring value carrying any recurrence field; accepts a positive interval and a clock time with and without a weekday; rejects an interval combined with a clock time or weekday, a clock time with weekday 7, a clock time with an interval, and a non-object.

`src/schedule/system/store-decode.test.ts` keeps its three existing cases and adds:

- A round-trip case: entries produced by `parseEverySchedule` for `every 5m` and `every monday at 8am` are given opaque key/id/script fields and decode with `ok: true`, proving parser output satisfies the shared validator.
- A parser-rule violation case: a stored entry whose `timeOfDay.minute` is 60 (which `parseTimeOfDay` rejects) is refused on load.

`src/schedule/index.test.ts` and `src/schedule/helpers.test.ts` pin the existing parser behavior and must pass unchanged.

## Spec

`product/specs/scheduling.md`: state in the durable-system-schedules paragraph that stored entries are checked with the same clock, interval and weekday rules the `schedule` parser uses, so a persisted entry whose recurrence could not have been created by the parser is rejected on load.

## Out of scope

- The store's version gate, duplicate-key check, runscript-name check and `script <name>` command-string check, which stay in `store-decode.ts`.
- Changing which values the parser or decoder accepts; this is a consolidation of existing rules.
- The `value.script as string` cast on the runscript-name check, which is unrelated to recurrence validation.
