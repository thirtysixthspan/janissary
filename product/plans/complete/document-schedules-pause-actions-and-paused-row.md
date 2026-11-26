# Document the pause and resume schedules topic actions and the paused wire row

**Complexity: 1/10** — spec-only edit to two sentences of one file; no production code, no behavior change, no new tests (p=1.578).

PR 2253 backlog item: *"Document the pause and resume schedules topic actions and the paused wire row in the tab-plugins spec."*

`product/specs/tab-plugins.md` still tells plugin authors that scheduled-command actions "cancel one entry, clear them all, or switch to the owning tab", and that the bundled schedules plugin "cancels an entry, clears them all, or switches to an owning tab". This branch adds two more `schedules` topic actions — `pause` and `resume` of one recurring system row by its immutable key — and a `paused: true` flag whose next run reads `paused`. Neither enumeration in the spec names what the topic or its rows now offer.

## Goal

Make the tab-plugins spec an accurate description of the schedules topic contract and its bundled plugin. The two affected sentences should name all five schedules actions, the authorization and failed-save rule that governs them, and the optional paused flag on a system wire row, so a plugin author reading the spec discovers both new mutation paths instead of concluding that only cancel, clear, and focus exist.

## Requirements

1. The "Scheduled-command actions" sentence names cancelling one entry ("cancel one entry").
2. The sentence names clearing one owner's entries, not clearing everything ("clear one owner's entries").
3. The sentence names switching to the owning tab ("switch to the owning tab").
4. The sentence names pausing a recurring system row by its immutable key ("pause or resume a recurring system row by its immutable key").
5. The sentence names resuming a recurring system row by its immutable key ("pause or resume a recurring system row by its immutable key").
6. The sentence states each action is authorized against the plugin's current aggregated view ("each authorized against the plugin's current aggregated view").
7. The sentence states a failed save is returned as a domain error the schedules intent rejects ("with a failed save returned as a domain error that the schedules intent rejects").
8. The "Bundled schedules plugin" section states a system row may carry a `paused: true` flag ("a system row may carry a `paused: true` flag").
9. The section states that a paused system row's next run reads `paused` ("whose next run reads `paused`").
10. The section states the plugin can pause or resume such a row through those topic actions rather than only cancel, clear, and focus ("the plugin can pause or resume such a row through those topic actions rather than only cancel, clear, and focus").

## Design decisions

- Edit only the two named sentences in `product/specs/tab-plugins.md`, in place; do not restructure the spec, add a section, or touch any other spec file.
- Treat the named source files and their colocated tests as the source of truth for what the topic offers, because the backlog Proposal was written by a reviewer who did not run the tests.
- Keep the existing "A topic action returns `undefined` for success or no current target and may return a domain error" sentence as written; the entry explicitly asks the preceding sentence to carry the authorization and failed-save clause too.
- Change no application behavior, no source file, and no test file. The spec prose is the whole deliverable.

## Preserved behavior

1. Tab cancel and each owner's clear keep routing to that owner alone, and the extended sentence must describe clearing one owner's entries without implying a single global clear. Pinned by `src/plugins/topics.test.ts` › `routes tab cancel and each owner's clear to that owner alone`.
2. A failed system clear is reported as a domain error and leaves tab schedules untouched, so the new failed-save wording must not replace that guarantee. Pinned by `src/plugins/topics.test.ts` › `reports a failed system clear and leaves tab schedules untouched`.
3. A paused system row carries `paused: true` and `next: 'paused'` while keeping its stored-time sort position, so the spec must name the flag without inventing a different wire shape. Pinned by `src/schedule/views.test.ts` › `marks a paused system row without moving it from its stored-time position`.

## Assumptions

1. The topic action union already declares both new actions beside cancel, clear, and focusOwner: `src/plugins/api-topics.ts:107` `| { topic: 'schedules'; action: 'pause'; tab: 'system'; id: string; owner: 'system'; key: string }`.
2. Pause and resume are authorized against a current recurring system row and a failed save is returned as the domain error: `src/plugins/schedule-topic-actions.ts:47` `return managers.schedule.aggregatedView().some((row) => row.owner === 'system' && row.key === action.key && row.id === action.id && row.tab === action.tab && row.recurring);`.
3. The plugin's `pause` and `resume` intents carry the error into `rejectRequest`: `src/plugins/schedules/activate.ts:85` `if (error) capabilities.rejectRequest(error);`.
4. A paused system row's wire next-run text is the literal `paused`: `src/schedule/views.ts:43` `...(e.paused && { paused: true as const, next: 'paused' })`.
5. The import-free plugin row shape carries the same optional flag on system rows only: `src/plugins/schedules/shared.ts:14` `{ owner: 'system'; key: string; paused?: true }`.
6. The two sentences to edit are the "Scheduled-command actions" sentence at `product/specs/tab-plugins.md:122` and the bundled plugin paragraph's action sentence at `product/specs/tab-plugins.md:246`.

## Existing functionality

1. The schedules topic already declares all five actions in one union: `src/plugins/api-topics.ts:101` `export type TabPluginTopicAction`.
2. One dispatcher authorizes every schedules action against the aggregated view: `src/plugins/schedule-topic-actions.ts:6` `export function scheduleTopicAction(managers: Managers, action: TabPluginTopicAction): string | undefined`.
3. The bundled plugin's intent table already includes `pause` and `resume` beside `cancel`, `clear`, and `focus-owner`: `src/plugins/schedules/activate.ts:62` `intent: defineIntents('schedules', isSchedulesPayload, {`.
4. The aggregated view already emits the paused flag and text: `src/schedule/views.ts:20` `export function aggregatedScheduleView(`.
5. Colocated tests already pin the new behavior: `src/plugins/topics.test.ts:442` `it('pauses and resumes one current recurring system key', () => {`.

## Implementation steps

1. In `product/specs/tab-plugins.md`, extend the "Scheduled-command actions" sentence so it names all five schedules actions — cancel one entry, clear one owner's entries, switch to the owning tab, and pause or resume a recurring system row by its immutable key — and states that each is authorized against the plugin's current aggregated view with a failed save returned as a domain error the schedules intent rejects. Replace "clear them all" with "clear one owner's entries" so the per-owner clear is not misdescribed. Leave the following sentences in that paragraph as they are.
2. In the same file's "### Bundled schedules plugin" section, extend the sentence about what the plugin does with the topic so it names cancelling one entry, clearing one owner's entries, switching to an owning tab, and pausing and resuming a recurring system row by key, and add that a system row may carry `paused: true` with its next run reading `paused`, which the plugin pauses or resumes through those topic actions rather than only cancel, clear, and focus. Leave the rest of the paragraph as it is.
3. Reread both edited sentences against `src/plugins/schedule-topic-actions.ts`, `src/plugins/api-topics.ts`, `src/plugins/schedules/activate.ts`, `src/plugins/schedules/shared.ts`, `src/schedule/views.ts`, and their colocated tests, confirming both enumerations name all five actions and the paused wire field. Build command: `$janissary/scripts/run.mjs check-diff` (spec-only change; no lint or test is scoped, but the command is run as required).

## UI design

None — this change edits spec prose only and creates or modifies no user interface surface.

## Tests

This plan changes no application behavior and introduces no code, so no tests are added, and tests of documentation are not introduced. The existing tests named under Preserved behavior and Existing functionality already pin the behavior the revised spec describes and are left untouched. `$janissary/scripts/run.mjs check-diff` confirms no regression.

## Out of scope

- Any source or test file, including the five named source files and their colocated tests.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- `help/commands.md`, `help/keys.md`, and other help pages: no command, flag, or key binding changes.
- Other spec files and other paragraphs of `product/specs/tab-plugins.md`.
- The pull request title and description: the named work item calls for no description correction.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read `product/specs/tab-plugins.md:122` and `:246` and compare them with `src/plugins/api-topics.ts:105-115`, `src/plugins/schedule-topic-actions.ts:6-49`, `src/plugins/schedules/activate.ts:62-96`, `src/plugins/schedules/shared.ts:14`, and `src/schedule/views.ts:35-46`. Confirm that both enumerations name all five schedules actions (cancel one entry, clear one owner's entries, switch to the owning tab, pause and resume a recurring system row by its immutable key), that the first carries the current-aggregated-view authorization and failed-save domain-error rule, and that the bundled section names `paused: true` with the next run reading `paused`. A sentence that still lists three actions, says "clear them all", or omits the paused field shows the change was not made correctly.
