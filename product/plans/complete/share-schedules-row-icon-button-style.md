# Share the schedules row icon-button style between pause and delete

**Complexity: 3/10** — ~5 production lines added across 2 files, 6 requirements, 4 test scenarios (p=4.4234)

## Goal

The recorded finding reads "Share the duplicated row icon button style added for the pause control." The pause control added by this pull request repeats all eight icon-button declarations already present on the delete button. Keeping two identical declaration blocks means a later hover, focus, or color change applied to one row icon can drift from the other. This change moves those declarations into one shared rule used by both buttons, with the stylesheet test rewritten to pin the shared rule instead of the duplicated block.

## Requirements

1. "`Share the duplicated row icon button style added for the pause control.`" — the eight icon-button declarations live in exactly one shared rule.
2. "`combine the identical declarations of .schedules-row-delete and .schedules-row-pause into one shared rule`" — the stylesheet contains no second copy of that declaration block.
3. "`either a common class applied to both buttons`" — a shared class carries the icon-button declarations and is applied to both row buttons.
4. "`keep the existing class names on the pause and delete buttons and add the shared class to each`" — the pause button keeps `schedules-row-pause`, the delete button keeps `schedules-row-delete`, and each additionally carries the shared class.
5. "`still pins the new pause styling without depending on the duplicated declaration block`" — the stylesheet test asserts the declarations of the shared rule rather than a `.schedules-row-pause` declaration block.
6. "`keeping its other assertions passing`" — every other assertion in `web/src/plugins/schedules/schedules-style.test.ts` remains unchanged and passes.

## Design decisions

- Use a common class rather than a comma-separated selector, because the work item says "add the shared class to each" button in `SchedulesRows.tsx` (Assumption 2).
- Name the shared class `.schedules-row-icon-button` and give it the eight declarations that are currently identical on the two rules (Assumption 1).
- Remove the two now-redundant per-button CSS rules instead of leaving empty selectors; the class names stay on the buttons as DOM hooks (Assumption 2).
- Update only the two icon-related stylesheet tests; leave the grid, subgrid, ellipsis, wrapping, and metadata-button tests byte-for-byte unchanged (Assumption 3).
- Make no spec, help, or documentation edit: this is an internal stylesheet refactor with no user-visible behavior change.

## Preserved behavior

1. The full and compact schedules grids keep their exact `grid-template-columns` values and the subgrid row rule. The refactor must not add, remove, or reorder a grid column. Pinned by `sizes each column to its content and lets the command column shrink` in `web/src/plugins/schedules/schedules-style.test.ts`.
2. Paused rows keep the muted text color declared for them. The refactor must not remove or alter that rule while deduplicating the icon-button rules. Pinned by `styles the pause control like the trash icon and mutes paused rows` in `web/src/plugins/schedules/schedules-style.test.ts`.

## Assumptions

1. `web/src/plugins/schedules/schedules.css:20-27` shows `.schedules-row-delete` and `.schedules-row-pause` carrying the identical declarations `background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px; padding: 0 4px; line-height: 1; justify-self: center;`, so one rule can replace both.
2. `web/src/plugins/schedules/SchedulesRows.tsx:51` `className="schedules-row-pause"` and `web/src/plugins/schedules/SchedulesRows.tsx:68` `className="schedules-row-delete"` are the two class hooks that must remain on the buttons.
3. `web/src/plugins/schedules/schedules-style.test.ts:37` `expect(schedules).toContain('.schedules-row-delete {');` and `web/src/plugins/schedules/schedules-style.test.ts:42` `expect(schedules).toContain('.schedules-row-pause {');` are the two assertions that currently pin the duplicated rules.
4. `web/src/plugins/schedules/schedules.css:47` `.schedules-row.paused { color: var(--muted); }` is independent of the icon-button reset and stays as it is.

## Existing functionality

1. `web/src/plugins/schedules/schedules.css:10-13` `.schedules-header .plugin-actions button` already uses the same transparent icon-button reset, providing the house style the shared rule follows.
2. `web/src/plugins/schedules/schedules-style.test.ts:19` `schedules.match(/\.schedules-headings > span, \.schedules-row > span \{[^}]+\}/)?.[0]` provides the regex-match pattern for asserting a rule's declarations without a full literal block.
3. `web/src/plugins/schedules/SchedulesTab.test.tsx:393` `querySelectorAll('.schedules-row-pause')` already pins the pause class in the rendered DOM and keeps passing when a second class is added.

## Implementation steps

1. In `web/src/plugins/schedules/schedules.css`, replace the two per-button rules with a single `.schedules-row-icon-button` rule holding the eight shared declarations. Leave the `grid-template-columns` declarations and the `.schedules-row.paused` rule untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/plugins/schedules/SchedulesRows.tsx`, add `schedules-row-icon-button` to the pause button's and the delete button's `className` values, retaining `schedules-row-pause` and `schedules-row-delete` on their respective buttons. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/plugins/schedules/schedules-style.test.ts`, update the trash-icon and pause-control tests to match the shared rule and assert its eight declarations. Keep the `.schedules-clear` and `.schedules-row.paused` assertions, and leave all other tests unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Remove the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton because it is the last entry, then move this plan to `product/plans/complete/`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The row icon buttons keep the same appearance, placement, and interactions: the shared rule applies the identical declarations the two rules applied before. No new state, key binding, or accessibility attribute is introduced.

## Tests

- Requirement 5: in `web/src/plugins/schedules/schedules-style.test.ts`, the pause-control test matches the single `.schedules-row-icon-button` rule, asserts all eight icon-button declarations on it, and keeps the existing `.schedules-row.paused` assertion.
- Requirement 6: the trash-icon test asserts the shared rule and keeps its `.schedules-clear` negative assertion; every other test in the file stays unchanged.
- No new test files. The existing `SchedulesTab.test.tsx` tests continue to pin the pause class in the rendered DOM.

## Out of scope

- No change to grid layout declarations or to `.schedules-row.paused`.
- No spec, help, or documentation edit; the refactor changes no user-visible behavior.
- No change to the PR title or description.
- No new component, hook, or stylesheet module; the shared class lives in the existing stylesheet.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes.
2. Concrete reading-based check: read `web/src/plugins/schedules/schedules.css` and confirm exactly one rule holds the eight icon-button declarations under `.schedules-row-icon-button`, that neither `.schedules-row-delete` nor `.schedules-row-pause` still carries a declaration block, and that the `grid-template-columns` lines and `.schedules-row.paused { color: var(--muted); }` are unchanged. Then read `web/src/plugins/schedules/SchedulesRows.tsx` and confirm both row buttons list `schedules-row-icon-button` alongside their original class names. A second copy of the declarations, a dropped original class name, or an altered grid or paused-row rule means the change was not made correctly.
