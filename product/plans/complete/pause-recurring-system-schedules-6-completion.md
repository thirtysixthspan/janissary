# Offer state-aware pause and resume completions

**Complexity: 2/10** — ~18 added lines across 2 files, 3 requirements (p=4.288)

## Goal

Make tab completion reflect pause state after `schedule system`. Today completion offers `list`, `cancel`, and `clear` at the system verb slot and a single flat name list after `cancel`. This change offers `pause` and `resume` as verbs and, after each, only the names that verb can act on: active recurring names for `pause`, paused names for `resume`. No other completion behavior changes.

Source: `./product/plans/complete/pause-recurring-system-schedules.md`. Depends on `pause-recurring-system-schedules-5-resume-command-and-list.md` for both reserved verbs and on `pause-recurring-system-schedules-3-pause-resume-mutations-manager.md` for the paused entries the lists are derived from.

## Requirements

1. "Tab completion after `schedule system` offers `pause` and `resume` alongside `list`, `cancel`, and `clear`" (user answer: "State-aware names").
2. "Tab completion after `schedule system pause` offers only the names of active recurring system schedules" (user answer: "State-aware names").
3. "Tab completion after `schedule system resume` offers only the names of paused system schedules" (user answer: "State-aware names").

## Design decisions

- Widen `SystemScheduleCompletions` from `{ names: string[]; scripts: string[] }` to add `activeRecurringNames: string[]` and `pausedNames: string[]`. Keep `names` for `cancel` and `scripts` for the add path, so no existing completion changes.
- At the system verb slot, `completeSystemSchedule` returns the five verbs: `list`, `cancel`, `clear`, `pause`, `resume`.
- After `pause`, complete from `activeRecurringNames`; after `resume`, complete from `pausedNames`; after `cancel`, keep completing from `names`. These are the same sets the command subplans count, so completion cannot suggest a name the command would reject.
- Build the two new lists in `src/controller/completion.ts` from the same single `managers.systemSchedule.list()` read that feeds `names`, so the three lists cannot disagree within one completion request. `activeRecurringNames` are entries with `recurring === true` and no `paused` flag; `pausedNames` are entries with `paused === true`. Deduplicate and sort exactly as `names` is deduplicated and sorted today.

## Assumptions

1. System schedule completion takes its name lists from one options object: `src/completion/system-schedule.ts:4` `export type SystemScheduleCompletions = { names: string[]; scripts: string[] };`.
2. The verb slot is completed in one branch: `src/completion/system-schedule.ts:16` `if (argumentIndex === 2) return completeWord(cursor, ['list', 'cancel', 'clear']);`.
3. Cancel's name completion uses `options?.names`: `src/completion/system-schedule.ts:17` `if (preceding[2]?.toLowerCase() === 'cancel' && argumentIndex === 3) {`.
4. The controller builds the options object from `systemSchedule.list()`: `src/controller/completion.ts:31` `const currentNames = 'systemSchedule' in managers ? managers.systemSchedule.list().map((entry) => entry.id) : [];`.
5. A paused system entry carries `paused: true` and keeps its `id` and `recurring` fields unchanged, from the earlier subplans.

## Existing functionality

1. `completeWord` is the single word-completion helper used by every branch: `src/completion/system-schedule.ts:2` `import { completeWord } from './helpers.js';`.
2. `completeSystemSchedule` is the single entry point for system-schedule completion: `src/completion/system-schedule.ts:8` `export function completeSystemSchedule(`.
3. The controller already gathers system names and runscripts for this options object: `src/controller/completion.ts:39` `{ names, scripts },`.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Widen `SystemScheduleCompletions` in `src/completion/system-schedule.ts` with `activeRecurringNames` and `pausedNames`. Make the type require both fields so a caller cannot omit them silently.
2. Change the verb-slot branch to return `['list', 'cancel', 'clear', 'pause', 'resume']`. Add two branches beside the cancel branch: after `pause`, complete from `options?.activeRecurringNames ?? []`; after `resume`, complete from `options?.pausedNames ?? []`. Leave the cancel and add-form branches untouched.
3. In `src/controller/completion.ts`, derive both lists from the same `systemSchedule.list()` result used for `names`, deduplicating and sorting them the same way, and pass them in the options object.
4. Add tests in `src/completion/index.test.ts` for the verb slot and for the two state-aware name lists, including a case where a paused entry is absent from `pause` suggestions and an active entry is absent from `resume` suggestions. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None found. Completion is a text surface, not a rendered control; the Schedules tab icon lands in a later subplan.

## Tests

- `src/completion/index.test.ts`: `pause` and `resume` appear at the verb slot beside the three existing verbs (Requirement 1).
- `src/completion/index.test.ts`: names after `schedule system pause` are exactly the active recurring system schedules, and names after `schedule system resume` are exactly the paused ones (Requirements 2 and 3).
- `src/completion/index.test.ts` existing cancel-name, script-name, and recurrence-form completion cases still pass.

## Out of scope

- No change to tab-schedule completion, to global command completion, or to the `names` and `scripts` lists.
- No completion for `pause until` or any other deferred feature.
- No command, wire, or UI behavior changes.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Concrete end-to-end check in the running app: create two system schedules, pause one, then type `schedule system ` and press Tab; confirm the suggestions include `pause` and `resume` alongside the three existing verbs. Type `schedule system pause ` and Tab; confirm only the active schedule's name appears. Type `schedule system resume ` and Tab; confirm only the paused schedule's name appears.
