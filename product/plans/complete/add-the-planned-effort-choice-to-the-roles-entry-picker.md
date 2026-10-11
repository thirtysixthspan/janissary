# Add the planned effort choice to the roles entry picker

**Complexity: 3/10** — one third dropdown in the picker the card already owns, one conditional field in the payload it builds, and the tests for both. No server change: the entry type, its guard, the activation handler, and the file writer all already carry an optional effort, and the per-entry dropdown has been writing one all along.

The plan that built the tab settled that the add-entry picker is a harness/model/effort picker, and wrote the file format with `"effort"` present on an entry whenever the entry stores one. The picker offers harness and model only, so `addPicked` always builds a bare `{ harness, model }` and every entry added through it arrives at the effort the user did not choose — the default. Choosing an effort then costs a second, persisted edit on a row that has just been created. The spec and the user documentation have both narrowed to "harness, model, and Add", so the plan and the shipped wording disagree with each other and the code sides with the narrower one.

## Goal

- The picker offers effort alongside harness and model, with `default` as the first option and the catalog's own levels as the rest.
- An entry added with an effort stores it; one added at the default stores no `effort` key at all, exactly as the file format specifies.
- Changing the harness, or closing and reopening the picker, returns effort to the default rather than carrying a stale choice onto a different model.
- The per-entry effort dropdown is untouched and keeps rendering a stored effort the catalog does not offer.

## Design decisions

- **The default omits the field rather than storing an empty string.** `add-entry` hands its entry straight to `writeRolesFile` (`src/plugins/roles/role-edits.ts` appends it unchanged), so an `effort: ''` would be written into the file verbatim. Omitting the key when nothing is chosen is what makes "no effort stored" mean what the format says it means, and it is why the payload is built conditionally rather than always carrying an effort.
- **The levels come from the payload's catalog, not from a local copy.** The card already receives `efforts` and already renders them in the per-entry dropdown, including the out-of-catalog escape hatch for a value the file already holds. A new entry is choosing from what the host knows, so it needs no such escape hatch: one shared source, so a level added to the catalog appears in both places at once.
- **The picker owns its selection.** The three dropdowns' state moves into a new `EntryPicker` component rather than growing the card's, which is also what the 200-line limit demands: the card had no room for a third control, and a picker that is its own component is the piece react-code-organization says to extract rather than compact. Because the picker unmounts when it closes, "a choice never carries to the next entry" stops being a rule to remember and becomes what the component tree already does. A harness change still clears the model and the effort inside it, for the same reason it always did: a different harness has different models and its own effort vocabulary.
- **The spec and the documentation follow the plan, not the gap.** Both currently promise a harness/model picker, so both need the word; the plan file is left alone because it is the record of the decision being implemented.

## Implementation steps

1. **`web/src/plugins/roles/EntryPicker.tsx` (new).** The picker as its own component: the harness, model, and effort selects plus Add and Cancel. It takes the catalog's `models` and `efforts`, owns the three selections, clears model and effort when the harness changes, and reports the chosen triple through `onAdd`.
2. **`web/src/plugins/roles/RoleCard.tsx`.** Render `EntryPicker` in place of the inline dropdowns, drop the three picker states, and build the entry in `addPicked` with the effort included only when one is selected.
3. **`product/specs/roles.md`** and **`documentation/user-documentation/tab-types/roles.md`** — name effort in the picker's description.

## Tests

`web/src/plugins/roles/RolesTab.test.tsx`:

- A picker submitted at the default raises `add-entry` with `{ harness, model }` and no effort key, keeping the existing assertion as the regression that the field is omitted rather than empty.
- A picker submitted with `xhigh` raises `add-entry` with `effort: 'xhigh'` in the entry.
- Changing the harness clears the chosen effort, and reopening the picker after cancelling clears it too.

`src/plugins/roles/activate.test.ts`:

- An `add-entry` carrying an effort writes it into the file, and the entry beside a default one keeps carrying no `effort` key at all — the round trip through the existing handler, which is what the plan promised the file format.

## Out of scope

- A free-text effort on a new entry. The per-entry dropdown is where an out-of-catalog value stays visible and editable; the picker chooses from the catalog.
- Changing the per-entry effort control, which already stores, clears, and displays an out-of-catalog value.
- Any change to the entry type, its guard, the activation, or the file writer. All of them already carry an optional effort.
- `product/plans/complete/roles-tab.md`, which records the decision this implements and is not restated here.

## Verification

- `./scripts/run.mjs check-diff` is clean: lint, both typechecks, and the roles tests on both sides.
- Manual check: click **Add entry** on `research`, pick codex, `gpt-6-sol`, and effort `xhigh`, press **Add**, and confirm the new row shows `xhigh` and the file carries `"effort": "xhigh"` on that entry. Repeat with `default` and confirm the file's entry has no `effort` key. Pick an effort, change the harness, and confirm the effort dropdown has returned to `default`.