# Add `schedule system resume`, paused list output, and paused-row cancel/clear

**Complexity: 5/10** — ~18 added lines across 3 files, 10 requirements, 10 scenarios (p=5.405)

## Goal

Complete the command surface for pause and resume. This change reserves `resume` after `schedule system`, runs it through `resumeByName` with the same message pattern as pause, prints a paused entry as `(paused)` in `schedule system list`, and confirms cancel, clear, and `execute` keep working on paused rows. It builds on the pause command and the engine subplans; after it, a user can pause and resume entirely from the command line.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md` for `resumeByName` and `pause-recurring-system-schedules-4-pause-command.md` for the reserved-verb and command-branch pattern.

## Requirements

1. "`schedule system resume <name>` resumes every paused system schedule with that exact name" (user answer: "Tab + command").
2. "A successful `schedule system resume <name>` prints `Resumed <name> in system.`" (user answer: "Mirror cancel").
3. "`schedule system resume <name>` prints `No paused scheduled command \"<name>\" in system.` when no paused system schedule has that name, and changes nothing" (user answer: "Mirror cancel").
4. "A failed save during a pause or resume command prints `Could not save system schedules.`, prints no success message, and leaves every entry as it was" (user answer: "Mirror cancel"). This subplan covers the resume side; the pause side landed in the previous subplan.
5. "`resume` immediately after `schedule system` is a reserved verb: followed by exactly one name it resumes, and any other shape returns the system usage line without creating a schedule" (user answer: "Reserve them").
6. "A stored system schedule already named `pause` or `resume` still loads, fires, and can be cancelled" (user answer: "Reserve them"). This subplan pins the `resume` half; the `pause` half landed in the previous subplan.
7. "`schedule system list` prints a paused entry as `<name>  <spec>  (paused)  script <name>`, with `(paused)` in place of `(next: <when>)`" (user answer: "(paused) replaces next").
8. "`schedule system cancel <name>` removes paused rows with that name as well as active ones" (user answer: "Core set").
9. "`schedule system clear` removes paused rows as well as active ones" (user answer: "Core set").
10. "`execute <name>` runs a runscript immediately even when a schedule naming it is paused" (user answer: "Core set").

## Design decisions

- Add one variant, `{ scope: 'system'; action: 'resume'; id: string }`, to `ScheduleParseResult`, and reserve `resume` in `parseSystemSchedule` exactly as `pause` is reserved. No other shape after `resume` creates a schedule.
- The resume branch in `runSystemSchedule` counts paused entries with the exact name from `owner.list()` before acting. A zero count prints the not-found line and never calls the owner. Otherwise it calls `resumeByName` and prints the success or failed-save line, mirroring cancel and pause.
- In the system `list` line, a paused entry renders `(paused)` where an active entry renders `(next: <when>)`. The stored `nextRun` is stale while paused, so the paused branch must not call `fmtNextRun` at all; printing the stale time would imply a future run. The line is still formatted in one place.
- Cancel-by-name and clear operate on the full entry list today, so they already include paused rows. This subplan pins that behavior with explicit tests rather than changing those branches. `execute` reads the runscript directly and never consults schedules, so it is likewise pinned by a test and left unchanged.
- The usage line already names `resume` from the previous subplan, so no usage change is needed here.

## Assumptions

1. The manager exposes `resumeByName`, added by `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md`, returning the same `SystemScheduleResult` shape cancel uses.
2. Cancel counts matches from the owner before acting and prints a not-found line on zero: `src/commands/schedule.ts:82` `const count = owner.list().filter((entry) => entry.id === parsed.id).length;`.
3. The system list line is formatted in one place: `src/commands/schedule.ts:73` `` `${entry.id}  ${entry.spec}  (next: ${fmtNextRun(entry.nextRun)})  script ${entry.script}` ``.
4. Cancel-by-name filters the full list without checking a paused flag: `src/schedule/system/manager.ts:62` `const next = cancelSystemScheduleByName(this.entries, name);`.
5. Clear commits an empty list when any entry exists: `src/schedule/system/manager.ts:73` `clear(): SystemScheduleResult {`.
6. A paused entry carries `paused: true` on the shared entry shape and keeps its `id`, `spec`, and `script` unchanged.

## Existing functionality

1. `parseSystemSchedule` already reserves `list`, `cancel`, and `clear`, and now `pause`: `src/schedule/index.ts:60` `function parseSystemSchedule(tokens: string[], now: Date): ScheduleParseResult {`.
2. The cancel and pause branches are the exact output pattern to mirror: `src/commands/schedule.ts:81` `if (parsed.action === 'cancel') {`.
3. `fmtNextRun` is the existing formatter for an active next-run time: `src/commands/schedule.ts:5` `import { formatSchedule, fmtNextRun } from '../schedule/display.js';`.
4. `execute` runs a runscript without consulting schedules, which is why Requirement 10 needs a test and no code change.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add the `resume` variant to `ScheduleParseResult` in `src/schedule/types.ts`, and reserve `resume` in `parseSystemSchedule` in `src/schedule/index.ts` beside `pause`, with the same "one name, no extras" rule.
2. In `src/commands/schedule.ts`, add a resume branch before the cancel branch. Count `owner.list().filter((entry) => entry.id === parsed.id && entry.paused === true)`. On zero, append `No paused scheduled command "${parsed.id}" in system.` and return. Otherwise call `owner.resumeByName(parsed.id)` and append `Resumed ${parsed.id} in system.` on `ok` or `Could not save system schedules.` on failure.
3. Change the system list line in `src/commands/schedule.ts` so a paused entry renders `(paused)` instead of `(next: ${fmtNextRun(entry.nextRun)})`, keeping the exact spacing of `<name>  <spec>  (paused)  script <name>`. Active lines stay byte-identical.
4. Add tests. In `src/schedule/index.test.ts`, assert `schedule system resume <name>` parses and any other shape after `resume` returns the system usage line without creating a schedule. In `src/commands/schedule.test.ts`, assert the exact resume success line, the not-found line, the failed-save line, `(paused)` in list, cancel-by-name and clear removing paused rows, and a pre-existing entry named `resume` still cancelling. In `src/commands/execute.test.ts`, assert a runscript whose only schedule is paused still runs immediately. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan changes command text only; the Schedules tab control lands in a later subplan.

## Tests

- `src/schedule/index.test.ts`: `schedule system resume <name>` parses; any other shape after `resume` returns the system usage line without creating a schedule (Requirement 5 here; the exact usage literal was delivered by `pause-recurring-system-schedules-4-pause-command.md`).
- `src/commands/schedule.test.ts`: exact resume and not-found messages, the failed-save line, `(paused)` in `schedule system list`, cancel-by-name and clear removing paused rows, and a pre-existing entry named `resume` still cancelling (Requirements 1 to 3, 6 to 9).
- `src/commands/execute.test.ts`: a runscript whose only schedule is paused still runs immediately (Requirement 10).
- `src/commands/schedule.test.ts` existing active list/cancel/clear cases keep their exact messages.

## Out of scope

- No completion for the new verbs, no plugin intents or topic actions, and no Schedules tab control. Those land in later subplans.
- No notification for resume, and no change to the paused flag semantics or recovery.
- No `resume until` time and no resume of one-shot or tab-owned schedules.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check in the running app: create `schedule system ping every 1m script ping`, pause it with `schedule system pause ping`, then type `schedule system list` and confirm the line reads `ping  every 1m  (paused)  script ping` with no next-run time. Type `schedule system resume ping` and confirm `Resumed ping in system.`, then `schedule system list` again and confirm a `(next: ...)` line is back. Type `schedule system resume nosuch` and confirm `No paused scheduled command "nosuch" in system.`. While paused, type `execute ping` and confirm the script runs immediately.
