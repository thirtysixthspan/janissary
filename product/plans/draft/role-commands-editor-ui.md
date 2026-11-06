# Role commands editor UI

**Complexity: 4/10** — adds a second editable role section with a picker, keyboard focus behavior, accessible names, and pure ordering logic.

## Goal

Show and edit each role's model list and native-command grants in the roles tab, using the role payload and command intents established by `role-native-command-catalog-and-grants.md`.

## Decisions and dependencies

- Depends on `role-native-command-catalog-and-grants.md`.
- Keep all client code inside `web/src/plugins/roles/`; the server payload remains the source of truth and the client holds only picker-open and selection state.
- Each role card has stacked `Models` and `Commands` sections. Rename **Add entry** to **Add model**. Keep model rows, effort controls, and dragging unchanged.
- Each section heading uses the muted 12px description style. Command rows reuse the `roles-entry` style: command text in the normal foreground, with a trash icon at the far right and no harness column or effort dropdown. Command rows do not drag. Show native commands in vocabulary order, with unknown hand-written strings last in stored order; preserve duplicates as adjacent rows.
- Unknown commands remain visible, dimmed with the missing-model style, titled `Not a native command`, and removable.
- With no commands, show a muted `No commands` row above **Add command**; with no models, show a muted `No models` row above **Add model**. If all nine native commands are listed, hide **Add command**. There is no loading or busy state; accepted edits appear on the next server publication.
- **Add command** is replaced in place by a `command…` dropdown listing only commands not already present, in vocabulary order, followed by **Add** and **Cancel**. **Add** is disabled until a command is selected. **Add** sends `add-command` and closes the picker; **Cancel** closes it. A row remove sends `remove-command` and removes every duplicate. If another client has already added or removed that command, the server writes nothing and raises no refusal; the card shows the published state.
- Both pickers focus their first dropdown when opened. Escape inside either picker cancels it. When either picker closes by Add, Cancel, or Escape, focus returns to its own **Add model** or **Add command** button. At narrow pane widths, command rows wrap the same way model entry rows do.
- Accessible names are exact: the command dropdown is `Command to add to role <name>`; each command remove button's title and label are `Remove <command>`; the model and command lists are labelled `Models of role <name>` and `Commands of role <name>` by their headings.
- No new key binding, loading state, or client-side persistence is introduced.

## Existing code to reuse

- `web/src/plugins/roles/RoleCard.tsx`, `EntryPicker.tsx`, and `roles.css` provide the role card and model-picker patterns.
- The payload and intents from `role-native-command-catalog-and-grants.md` supply command options and server mutations.
- `ai/guidelines/react-code-organization.md` governs feature colocation, pure modules, hooks, and thin components.

## Proposed changes

- Split the card's model and command sections into focused components under `web/src/plugins/roles/`, keeping `RoleCard.tsx` under the 200-line limit.
- Add a command picker and a pure module with colocated tests for vocabulary ordering, picker options, and whether **Add command** is shown.
- Add a focused picker hook for opening, initial focus, Escape cancellation, and focus restoration; apply it to the existing model picker as well as the new command picker.
- Update role styles for section headings, empty rows, and command rows without changing model-row behavior.
- Update `product/specs/roles.md` for the two sections, empty states, unknown values, picker behavior, and accessibility.

## Tests

- `web/src/plugins/roles/RolesTab.test.tsx`: both sections, empty states, names, ordering, unknown values, picker options, Add/remove intents, all-nine state, focus, Escape, and focus restoration.
- A colocated pure-module test covers ordering and picker options.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after implementation changes and tests.
- Confirm no cross-feature imports and that all new client modules remain under `web/src/plugins/roles/`.

## Out of scope

- Changing role persistence or the server's command vocabulary.
- Enforcing grants in the ACP tool table.
- Changing model ordering, effort editing, or drag behavior.
