# Share one survivor-selection rule across the split and arrange pane moves

**Complexity: 4/10** — ~50 added lines across 4 production files, 5 requirements and 7 test scenarios (p=5.18); a localized extraction of one pure helper plus call-site rewrites.

## Goal

`src/tab/split.ts` `moveToOtherPane` and `src/tab/arrange.ts` `movePane` move a tab to the opposite pane but choose the tab left visible in the vacated source pane through two different helper chains. `moveToOtherPane` uses `restorableLabel(activeLabel) ?? restorableLabel(secondaryLabel) ?? historyLabel ?? nearestLabel` over split-eligible tabs; `movePane` re-decides with `visibleInPane(secondaryTabLabel) ?? recentLabel` over center-action tabs. `src/tab/split-selection.ts` `moveTabToOtherPaneSelection` is a one-line passthrough to `moveToOtherPane`. The same starting layout can therefore leave a different tab selected depending on whether the move came from the Split button/drag path (through the passthrough) or from `tab pane` / `tab split` (through `movePane`). Extract one shared survivor-selection helper, call it from both paths, and drop the passthrough so callers use the canonical function directly. No command, key binding, or flag changes.

## Approach

Add `src/tab/survivor.ts` exporting `selectSurvivor(tabs, pane, candidates, focusHistory)`, a pure helper over the post-move tab list. It answers the first candidate label that still names a split-eligible tab in `pane`, then the most recent such label in `focusHistory`, then the first such tab in array order. Eligibility is `isSplitEligibleTab(tab) && centerPane(tab) === pane`; because the moved tab is relocated to the opposite pane before either caller selects, it is naturally excluded and no separate excluded label is needed. Using `isSplitEligibleTab` rather than `isCenterActionTab` makes notification tabs ineligible as pane survivors on both paths, matching the rest of the split rules.

`moveToOtherPane` calls the helper on the no-split branch (no candidates, source pane `left`) and on the split branch (candidates `activeLabel` then `secondaryLabel`), replacing its four private helpers. `movePane` calls it on the branch where a non-active tab moves out of the active pane, replacing its local `visibleInPane ?? recentLabel` decision and its now-unused `recentLabel` import. Delete the `moveTabToOtherPaneSelection` passthrough and update its two call sites (`src/tab/operations.ts`, `src/tab/arrange.ts`) to import and call `moveToOtherPane` directly. The helper keeps `split.ts` pure (it imports only `types.js` and `placement.js`) and introduces no import cycle.

## Implementation steps

1. Create `src/tab/survivor.ts` with the pure `selectSurvivor` helper and its private eligibility helpers. Run `$janissary/scripts/run.mjs check-diff`.
2. In `src/tab/split.ts`, remove the four private selection helpers, import `selectSurvivor` from `./survivor.js`, and use it in both branches of `moveToOtherPane`. Run `$janissary/scripts/run.mjs check-diff`.
3. In `src/tab/arrange.ts`, import `moveToOtherPane` and `hasSplit` from `./split.js` and `selectSurvivor` from `./survivor.js`; replace the passthrough call and the `visibleInPane ?? recentLabel` decision; delete `visibleInPane` and drop the unused `recentLabel` import. Run `$janissary/scripts/run.mjs check-diff`.
4. In `src/tab/operations.ts`, import `moveToOtherPane` from `./split.js` and replace the passthrough call. In `src/tab/split-selection.ts`, delete `moveTabToOtherPaneSelection` and its `moveToOtherPane` import. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/tab/survivor.test.ts` (new): cover candidate priority (first eligible candidate wins; an earlier ineligible candidate is skipped), most-recent-history fallback, first-eligible fallback, and that notification and wrong-pane tabs are never selected.
- `src/tab/arrange.test.ts`: add one cross-path case that drives the same starting split through both `moveToOtherPane` and `TabManager.arrangeTab('split')` and asserts the same `secondaryTabLabel`.
- Existing `src/tab/split.test.ts`, `src/tab/split-selection.test.ts`, and `src/tab/operations.test.ts` (if present) must pass unchanged.

## Out of scope

- Changing focus/active-tab assignment in `movePane`; only the vacated-pane survivor selection is unified.
- Changing pane-collapse, unread-dwell, drag, or completion behavior.
- New commands, flags, key bindings, or documentation for behavior that was not already documented.
