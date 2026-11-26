# Add the `schedule system pause <name>` command

**Complexity: 5/10** — ~20 added lines across 4 files, 8 requirements, 8 scenarios (p=5.319)

## Goal

Let a user pause recurring system schedules from the command line. Today `schedule system` reserves `list`, `cancel`, and `clear`, and any other first token is treated as the name of a new schedule. This change reserves `pause` as a verb, parses `schedule system pause <name>`, and runs it through `pauseByName`, with the same success, not-found, and failed-save messages `cancel` uses. It is the first user-facing entry point for pausing.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md` for `SystemScheduleManager.pauseByName`.

## Requirements

1. "`schedule system pause <name>` pauses every active recurring system schedule with that exact name" (user answer: "Tab + command", mirroring `schedule system cancel <name>`).
2. "A successful `schedule system pause <name>` prints `Paused <name> in system.`" (user answer: "Mirror cancel").
3. "Pausing a name whose recurring rows are all already paused prints `Paused <name> in system.`" (user answer: "Already-paused rows count as success (idempotent)").
4. "`schedule system pause <name>` prints `No recurring scheduled command \"<name>\" in system.` when no recurring system schedule has that name, including when only one-shots do, and changes nothing" (user answer: "Mirror cancel").
5. "A failed save during a pause or resume command prints `Could not save system schedules.`, prints no success message, and leaves every entry as it was" (user answer: "Mirror cancel"). This subplan covers the pause side; the resume side lands in the next subplan.
6. "`pause` immediately after `schedule system` is a reserved verb: followed by exactly one name it pauses, and any other shape returns the system usage line without creating a schedule" (user answer: "Reserve them").
7. "A stored system schedule already named `pause` or `resume` still loads, fires, and can be cancelled" (user answer: "Reserve them"). This subplan pins the `pause` half; the `resume` half lands in the next subplan.
8. "A malformed system invocation returns exactly `Usage: schedule system NAME <form> script <name> | schedule system list | schedule system cancel <name> | schedule system pause <name> | schedule system resume <name> | schedule system clear`" (user answer: "Insert after cancel"). The full line, including the not-yet-implemented resume verb, is written here; typing `schedule system resume <name>` still returns the usage line until the next subplan.

## Design decisions

- Add one variant, `{ scope: 'system'; action: 'pause'; id: string }`, to `ScheduleParseResult` in `src/schedule/types.ts`, next to the cancel variant.
- Reserve `pause` in `parseSystemSchedule` in the same branch as `cancel`: the verb with exactly one following name and no extra tokens parses as the new variant; any other shape falls through to the malformed-invocation error. This keeps the parser pure.
- `SYSTEM_SCHEDULE_USAGE` in `src/schedule/usage.ts` becomes the exact line in Requirement 8. It is a single string literal, so naming resume here is harmless: resume is not parsed yet and typing it still returns this usage.
- In `runSystemSchedule` in `src/commands/schedule.ts`, the pause branch first counts recurring entries with that exact name from `owner.list()`. A zero count prints the not-found line and does not call the owner, so the store is untouched. Otherwise it calls `pauseByName`, printing the success line on `ok` and `Could not save system schedules.` on failure. This mirrors the cancel branch exactly.
- "Recurring" means the entry's `recurring` field is true; one-shots with the same name are not counted and the not-found line is printed when they are the only matches.
- If `src/commands/schedule.ts` would pass 200 lines, move the system branch into a new module under `src/commands/` and import it back; do not compact code.

## Preserved behavior

1. `schedule system list`, `cancel`, and `clear` keep their exact messages for active entries. The new verb must not change those lines. Pinned by `src/commands/schedule.test.ts` › `lists, cancels every same-named system entry, and clears with exact messages`.
2. Tab-owned `schedule` grammar and its messages stay as they are. Reserving a system verb must not change tab `list`, `cancel`, or `clear`. Pinned by `src/commands/schedule.test.ts` › `lists, cancels and clears in the target tab`.
3. `system` stays reserved as the leading tab timer name while `in system` remains a tab target. The new reserved verb must not change that. Pinned by `src/schedule/index.test.ts` › ``reserves the leading system timer name while keeping `in system` as a tab target``.

## Assumptions

1. The system grammar reserves its management verbs in one branch: `src/schedule/index.ts:64` `if (action === 'list' && second === undefined) return { scope: 'system', action: 'list' };`.
2. Cancel reserves a verb with one argument and no extras, and rejects other shapes: `src/schedule/index.ts:66` `if (action === 'cancel' && second !== undefined && rest.length === 0) {`.
3. The system usage line is a single exported literal: `src/schedule/usage.ts:5` `export const SYSTEM_SCHEDULE_USAGE =`.
4. Cancel counts matches from the owner before acting and prints a not-found line on zero: `src/commands/schedule.ts:82` `const count = owner.list().filter((entry) => entry.id === parsed.id).length;`.
5. The manager exposes `pauseByName`, added by `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md`, returning the same `SystemScheduleResult` shape cancel uses.
6. A system entry carries `recurring` and an optional `paused` field, so a recurring active match is one with `recurring === true` and no `paused` flag.

## Existing functionality

1. `parseSystemSchedule` already owns all system verb reservation: `src/schedule/index.ts:60` `function parseSystemSchedule(tokens: string[], now: Date): ScheduleParseResult {`.
2. The cancel command branch is the exact output pattern to mirror: `src/commands/schedule.ts:81` `if (parsed.action === 'cancel') {`.
3. `appendCommandOutput` is the single output path for `schedule`, so the new messages need no new transport: `src/commands/schedule.ts:50` `const append = (text: string) => appendCommandOutput(managers, tab.label, { input: command_, output: text }, invocation);`.
4. `fmtNextRun` and the system list line are unchanged by this subplan: `src/commands/schedule.ts:73` `` `${entry.id}  ${entry.spec}  (next: ${fmtNextRun(entry.nextRun)})  script ${entry.script}` ``.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Add the `pause` variant to `ScheduleParseResult` in `src/schedule/types.ts`, copying the cancel variant with `action: 'pause'`.
2. In `src/schedule/index.ts`, add a `pause` branch in the early reservation section of `parseSystemSchedule`, beside the `cancel` branch at `:66`: `action === 'pause' && second !== undefined && rest.length === 0` returns the new variant. Put it before the marker/script add path at `:70` so no other shape after `pause` creates a schedule.
3. Replace the `SYSTEM_SCHEDULE_USAGE` literal in `src/schedule/usage.ts` with the exact line in Requirement 8, inserting `pause` and `resume` after `cancel`.
4. In `src/commands/schedule.ts`, add a pause branch before the cancel branch. Count `owner.list().filter((entry) => entry.id === parsed.id && entry.recurring && entry.paused !== true)`. On zero, append `No recurring scheduled command "${parsed.id}" in system.` and return. Otherwise call `owner.pauseByName(parsed.id)` and append `Paused ${parsed.id} in system.` on `ok` or `Could not save system schedules.` on failure. If the file would pass 200 lines, extract the system branch into a new module under `src/commands/` first.
5. Add tests. In `src/schedule/index.test.ts`, assert `schedule system pause <name>` parses to the new variant and that any other shape after `pause` returns `SYSTEM_SCHEDULE_USAGE` without producing an add. In `src/commands/schedule.test.ts`, assert the exact success line, the idempotent success when all matching rows are already paused, the not-found line when only one-shots carry the name, the failed-save line, and that a pre-existing entry named `pause` can still be cancelled. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. This subplan changes command text only; no rendered control is added. The row icon lands in a later subplan.

## Tests

- `src/schedule/index.test.ts`: `schedule system pause <name>` parses; any other shape after `pause` returns the system usage line without creating a schedule; the exact usage literal matches Requirement 8 (Requirements 6 and 8).
- `src/commands/schedule.test.ts`: exact pause and idempotent messages, the not-found line including the one-shot-only case, the failed-save line, and a pre-existing entry named `pause` still cancelling (Requirements 1 to 5 and 7).
- `src/commands/schedule.test.ts` existing list/cancel/clear cases keep their exact messages (Preserved behavior 1 and 2).
- `src/schedule/index.test.ts` existing system-name reservation case keeps `system` reserved and `in system` as a tab target (Preserved behavior 3).

## Out of scope

- No `resume` verb, no `(paused)` list text, no completion entries for pause or resume, and no tab control. Those land in later subplans.
- No notification for pause, and no change to what `execute` does.
- No pause of one-shot or tab-owned schedules, and no `pause until` time.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check in the running app: type `schedule system ping every 1m script ping`, then `schedule system pause ping` and confirm the reply is exactly `Paused ping in system.`. Type `schedule system pause ping` again and confirm the same success line. Type `schedule system pause nosuch` and confirm `No recurring scheduled command "nosuch" in system.`. Type `schedule system clear` afterwards and confirm the exact clear message, proving cancel/clear were not disturbed. No notification entry appears for any pause.
