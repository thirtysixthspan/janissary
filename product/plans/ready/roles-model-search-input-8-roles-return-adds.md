# Model search 8: Return in the roles picker's model input adds the entry

**Complexity: 2/10** — ~8 added lines, 1 file edited, 3 requirements, 3 test scenarios (p=3.87)

Run order: 8 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-7-roles-picker.md` (the search input in the Add model picker, including its exact-id Add rule) and `product/plans/ready/roles-model-search-input-6-return-and-escape.md` (`ModelSearchInput`'s `onSubmit`); it must land after both.

After subplan 7, Return in the roles picker's model input fills a highlighted candidate but otherwise does nothing. This step makes Return add the entry once the text is an exact enabled id, so a model can be chosen and added without leaving the keyboard: type, Return to accept the highlighted match, Return again to add.

## Goal

Pass an `onSubmit` from `web/src/plugins/roles/EntryPicker.tsx` to `ModelSearchInput`, document Return in the roles spec and user docs, and test it.

## Design decisions

All of these come from the source plan except the helper placement in the second bullet, which is a decision for this subplan.

- **Return accepts, then adds (user decision).** With the dropdown open and a candidate highlighted, Return replaces the text with that candidate's full id and closes the dropdown; the input consumes that Return (subplan 6) and `onSubmit` isn't called. With no candidate highlighted, whether the dropdown is closed or open with nothing highlighted, and the text an exact enabled id, Return adds the entry exactly as pressing Add does. In any other state Return does nothing.
- **One add path.** The picker's `onSubmit` adds when the trimmed text is an exact enabled id of the chosen harness and does nothing otherwise. Extract one module-private predicate inside `EntryPicker.tsx` (decision for this subplan) that reports whether the current trimmed `model` text is in `models[harness] ?? []`, and one add helper that calls `onAdd(harness, trimmed, effort)` only when that predicate passes. Use the predicate for Add's `disabled` (replacing subplan 7's inline `includes` check) and the add helper for both Add's `onClick` and the `onSubmit` prop, so the exact-id rule and the add call are written once. `onAdd` is `addPicked` in `web/src/plugins/roles/RoleCard.tsx`, which raises `add-entry` and calls `modelsPicker.closePicker()`; Return therefore sends the trimmed id and, like Add, closes the picker and returns focus to **Add model**.
- **Only the model input submits.** `ModelSearchInput` calls `onSubmit` only for a Return in the model input that the dropdown didn't consume (subplan 6); `onSubmit` takes no arguments and fires synchronously from the input's keydown, so the picker reads the text from its own state rather than from an event. Return on the harness select, the effort select, or the Add and Cancel buttons keeps its native behavior. The picker container's `onKeyDown` stays Escape-only. The input already suppresses `onSubmit` during IME composition (subplan 6), so the Return that confirms a composition never adds.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The picker being wired | `EntryPicker` in `web/src/plugins/roles/EntryPicker.tsx` | Subplan 7: the search input, the controlled text state, Add's exact-id rule; 65 lines before subplan 7, so a few more stay under the 200-line `max-lines` limit |
| Return pass-through | `ModelSearchInput`'s optional `onSubmit` prop (`() => void`) | Subplan 6; called synchronously, with no arguments, for a Return the dropdown didn't consume, and suppressed during IME composition |
| Add's close and focus return | `addPicked` in `web/src/plugins/roles/RoleCard.tsx`, passed as `onAdd` through `RoleModels.tsx` | Raises `add-entry` and calls `modelsPicker.closePicker()`, which restores focus to **Add model**; the existing 'focuses each picker, cancels on Escape, and restores focus after Add, Cancel, and Escape' case in `web/src/plugins/roles/RolesTab.test.tsx` covers Add |

## Proposed changes

- `web/src/plugins/roles/EntryPicker.tsx`: pass `onSubmit` as above and extract the shared predicate and add helper; wire the helper to Add's `onClick` and to `onSubmit`. No new module or component, and the file stays under the 200-line `max-lines` limit.
- `product/specs/roles.md`: in the **Add model** paragraph of `### What the tab shows` (the paragraph subplan 7 rewrote and deliberately left this step's Return sentence out of), add that Return in the model field fills a highlighted candidate and otherwise adds when the text is an exact enabled id, exactly as Add does.
- `documentation/user-documentation/tab-types/roles.md`: in the first paragraph under `## Add a model to a role` (the one beginning 'Each card has **Models** and **Commands** sections', which subplan 7 updated), add that pressing `Return` on a highlighted row fills it and pressing `Return` again adds the model. Keep it task-facing with no file paths or function names (`ai/guidelines/user-documentation.md`).

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`, beside the existing 'focuses each picker, cancels on Escape, and restores focus after Add, Cancel, and Escape' case. Drive the input with `fireEvent.keyDown` on `getByLabelText('Model for the new entry')` using `{ key: 'Enter' }` (it is a text input after subplan 7). A typed id auto-highlights its first match row (subplan 4), so the first Return fills and the second Return, with the list closed, adds; assert the `add-entry` intent and focus on **Add model** the way that existing case does for Add.

- Return in the model input with an exact id typed with surrounding spaces sends `add-entry` with the trimmed id, and focus returns to **Add model**.
- Return with partial text sends nothing and leaves the picker open.
- Return with a highlighted row fills the id and sends nothing. A second Return sends `add-entry`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, roles tab (the source plan's roles step 5): run `roles`, press **Add model**, Tab to the model input, type part of an id, and press Return to accept the highlighted match. Press Return again and confirm the entry appears on the card and in `roles.json`.

## Out of scope

- Return in any other picker control.
- The New harness dialog's Return (subplan 11).
- Any change to the roles plugin's server side.
