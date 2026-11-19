# Model search 7: The roles tab's Add model picker uses the search input

**Complexity: 5/10** — ~25 added lines, 5 files edited, 11 requirements, 10 test scenarios (p=5.69)

Run order: 7 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-6-return-and-escape.md` (Escape handling and the `web/src/plugins/api.ts` re-export of `ModelSearchInput`), which completes the input built in subplans 1 to 5.

Feature text (as recorded in the source plan; the `## development` section of `product/backlog/features.md` is now empty): "move model selection in the roles tab from a selectbox to a model search input field with tab completion, candidate dropdown, clickable candidates." This step delivers it for the roles tab. The **Add model** picker's model `<select>` becomes the shared search input, Add accepts only an exact enabled id, Escape closes the dropdown before the picker, and a blank input lists the models the existing roles use most. Return-to-add from the model input lands in subplan 8.

## Goal

Swap `ModelSearchInput` into `web/src/plugins/roles/EntryPicker.tsx`, thread the roles' entries down to it, style the input like the picker's selects, and update the roles spec, the user docs, and the roles tab tests for everything except Return.

## Design decisions

All of these come from the source plan.

- **Replace the model select (feature text).** The model `<select>` in the Add model picker becomes `ModelSearchInput`, between the harness and effort selects, with the placeholder `model…` and the accessible name `Model for the new entry`, both carried over from the select.
- **Candidates are the enabled catalog (from precedent).** The input's `ids` are `models[harness] ?? []`, the chosen harness's enabled ids from `catalog.models` in `RolesPayload` (`product/specs/roles.md`). The `?? []` matches today's `EntryPicker` and gives a harness with no enabled models an empty list; the shared input handles that like any no-match query. The picker needs no server or protocol change.
- **Search is scoped to the chosen harness (user decision).** The harness select stays first. Changing the harness clears the typed text and the effort, as `changeHarness` in `EntryPicker.tsx` already does for both.
- **The picker owns the text.** It keeps the text in its own state. Reopening clears it, since the picker unmounts on close.
- **Add needs an exact catalog id (user decision).** Add is enabled only when the trimmed text exactly equals (case-sensitive) one of the chosen harness's enabled ids, written inline as an `includes` check on the trimmed text with no helper. Partial or unknown text keeps Add disabled, so the picker still can't add a model outside the enabled catalog, as with today's select. Add sends the trimmed id.
- **Escape closes the dropdown first (user decision).** The picker container's existing `onKeyDown` Escape handler stays as it is. It now sees an Escape from the model input only when the dropdown was already closed, because the input stops the propagation of the Escape it consumes (subplan 6). Escape in any other picker control cancels the picker as today.
- **"Most used" reads the payload's roles (user decision).** `RolesTab` passes `roles.map((role) => role.entries)` as a new `roleEntries` prop through `RoleCard` and `RoleModels` down to `EntryPicker`, which hands it to `ModelSearchInput` with the chosen harness. It includes the role being edited. `RoleEntry` (`src/plugins/roles/shared.ts`) already has the `harness` and `model` fields the ranking reads, so no mapping is needed.
- **A republish keeps the text and recomputes (user decision).** A new payload while the picker is open never changes the typed text. The candidates, the most-used list, and Add's enabled state are recomputed from the new catalog and roles, so an exact id that was just disabled turns Add off and one just enabled turns it on.
- **Picker contract kept (from precedent).** The picker focuses its first control when opened, cancels on Escape, and returns focus to **Add model** on Add, Cancel, or Escape. It starts on `default` effort and resets the model and effort when the harness changes or the picker is reopened (`product/specs/roles.md`). `firstControlRef` remains the harness select, so `useRolePickerFocus` and its `HTMLSelectElement` typing are unchanged. **Add model** still focuses the harness select. Tab from there reaches the model input, and focusing it opens the dropdown.
- **The input looks like the picker's selects (user decision).** A `.roles-picker input` rule in `web/src/plugins/roles/roles.css` matches `.roles-picker select`: transparent background, `--fg` text, a 1px `--border` edge, a 3px radius, and 12px text. The dropdown's own look comes from subplan 2's `theme.css` rules.
- **Wording (user decision).** The rows, `type to search`, and `No matching models` come from the shared component unchanged.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The picker being changed | `EntryPicker` in `web/src/plugins/roles/EntryPicker.tsx`, opened from `RoleModels` in `web/src/plugins/roles/RoleModels.tsx` | Harness, model, and effort selects plus Add and Cancel; owns its selection and unmounts on close; 65 lines today, so these additions stay under the 200-line `max-lines` limit with no extraction |
| Prop path | `RolesTab.tsx` → `RoleCard.tsx` → `RoleModels.tsx` → `EntryPicker.tsx` | `catalog.models` already travels this path as `models` |
| Picker focus handling | `useRolePickerFocus` in `web/src/plugins/roles/useRolePickerFocus.ts` | `firstControlRef` is typed `HTMLSelectElement`; unchanged |
| The shared input | `ModelSearchInput`, re-exported from `web/src/plugins/api.ts` | Subplans 4 to 6; the roles plugin imports it from `../api` |
| Select look | `.roles-picker select` in `web/src/plugins/roles/roles.css` | The input copies it |
| Chunk boundary check | `web/src/plugins/roles/chunk-imports.test.ts` | Walks the roles chunk's static imports |

## Proposed changes

- `web/src/plugins/roles/EntryPicker.tsx`: replace the model select with `ModelSearchInput` (imported from `../api`), passing `ids` (`models[harness] ?? []`), `roleEntries`, `harness`, `value` and `onChange` (the picker's controlled text and its string-valued setter, subplan 4), `placeholder`, and `aria-label`. Add's `disabled` becomes "the trimmed text isn't an exact id", and Add calls `onAdd(harness, trimmed, effort)`. Keep `changeHarness` clearing the text and effort, and keep the container's Escape handler.
- `web/src/plugins/roles/RolesTab.tsx`, `RoleCard.tsx`, `RoleModels.tsx`: add the `roleEntries` prop (a readonly list of each role's `RoleEntry[]`) and pass it down. `RolesTab` computes it once per render from `roles`.
- `web/src/plugins/roles/roles.css`: the `.roles-picker input` rule above.
- `product/specs/roles.md`: rewrite the **Add model** sentence ("**Add model** opens a small picker — harness, model, effort, and Add — so an entry can be added without a pointer.") to describe the search input: typing filters the chosen harness's enabled models as a contiguous, case-insensitive match, best first, up to ten; Tab completes a single match or a narrowing common prefix; the dropdown, its click-to-fill rows, and hover; the blank-input most-used list (roles counted, used models only, at most ten) and its `type to search` hint; `No matching models`; Add's exact-id rule; and the first Escape closing the dropdown. Keep the effort sentences ("The picker starts on `default` …") unchanged. Subplan 8 adds the Return sentence.
- `documentation/user-documentation/tab-types/roles.md`, "## Add a model to a role": replace "pick the harness, model, and effort, and press **Add**" so it says you pick the harness, type to search for the model, Tab completes, a blank field lists the models your roles use most, and you click a row to fill it. Update the following focus and Escape paragraph so the first `Escape` in the model field closes the list and the next closes the picker. No file paths or function names (`ai/guidelines/user-documentation.md`).

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`:

- Update the existing picker tests that drive the `Model for the new entry` select so they type into the input instead. `fireEvent.change` with a value still works on a text input. The enabled-models case that reads the select's `options` instead types each id and checks Add's state: `enabled-model` enables Add and `disabled-model` doesn't.
- Add:
  - Add is disabled for partial text and enabled for an exact id.
  - Add with an exact id typed with surrounding spaces sends `add-entry` with the trimmed id.
  - The first Escape closes the dropdown and the second cancels the picker, with focus back on **Add model**.
  - A harness change clears the text.
  - The most-used list reflects the payload's roles: focusing a blank input lists the models the fixture's roles use, most-used first. Use a fixture where a role entry's model id is also in `catalog.models[harness]` — the blank list counts only used enabled ids, so a fixture whose used models are all missing or disabled shows only `type to search` (source plan, "Blank input lists used models only").
  - A republished catalog that disables the typed id disables Add.

`web/src/plugins/roles/chunk-imports.test.ts` runs unchanged and must stay green, confirming that reaching `ModelSearchInput` through `../api` keeps the roles chunk within its allowed imports.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, roles tab: run `roles` and press **Add model** on a role. These are the source plan's roles steps 1 to 4, 6, and 7. Step 5 (Return adds) is in subplan 8.
  1. Tab to the model input and confirm the dropdown lists the harness's most-used models.
  2. Type `opus` and confirm the matching rows with `opus` marked.
  3. Press Tab and confirm the text completes to the common prefix.
  4. Click a candidate and confirm it fills the input and Add enables.
  5. Reopen the picker, type `zzz`, and confirm `No matching models` with Add disabled.
  6. Press Escape twice and confirm the dropdown closes first, then the picker.

## Out of scope

- Return-to-add from the model input (subplan 8).
- The New harness dialog (subplans 9 to 11).
- Any change to the `roles.json` format, or to the roles plugin's server side.
- The harness and effort selects in the picker, and the per-entry effort dropdown on each role card row.
- Command-line completion of `harness … --model` (`product/specs/tab-completion.md`), which is unchanged.
