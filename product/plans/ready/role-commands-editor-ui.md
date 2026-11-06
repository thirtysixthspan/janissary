# Role commands editor UI

**Complexity: 5/10** — client-only role sections with shared picker focus behavior, publication races, pure command ordering, and interaction coverage.

## Goal

Show and edit each role's model list and native-command grants in the roles tab, using the payload and command intents from the completed `product/plans/complete/role-native-command-catalog-and-grants.md` subplan.

## Decisions and dependencies

- Depends on `role-native-command-catalog-and-grants.md` being complete: `Role.commands` stores each role's grants and `RolesPayload.nativeCommands` supplies the ordered vocabulary. `RolesTab` forwards `nativeCommands` to each `RoleCard`; the client does not recreate the vocabulary.
- Keep all client code inside `web/src/plugins/roles/`, with no cross-feature imports. `RoleCard` keeps its role name and description drafts, drag handlers, capability and refusal wiring, and passes only display data and typed edit callbacks to its section components.
- Each card has stacked `Models` and `Commands` sections, in that order. Keep model rows, effort controls, and entry drag behavior unchanged. Rename the visible **Add entry** button to **Add model**, and use `roles-add-model` for its class and tests.
- Each section heading uses the muted 12px description style. Give the two lists accessible names `Models of role <name>` and `Commands of role <name>` through their headings. Show a muted `No models` row above **Add model** when a role has no entries.
- Command rows reuse the `roles-entry` row spacing and border, with command text in the normal foreground and a trash icon at the far right; they have no harness column, effort dropdown, or drag behavior. Preserve duplicate rows. Order stored native commands by `nativeCommands`, with duplicate copies adjacent; append unknown hand-written command strings in their original stored order. Unknown rows use `roles-entry-missing`, have the title `Not a native command`, and remain removable.
- Put the pure command display rules in `web/src/plugins/roles/role-commands.ts`: `orderedRoleCommands` returns all stored rows in the display order above; `availableRoleCommands` returns vocabulary entries not already present, in vocabulary order; and `canAddRoleCommand` is true while at least one vocabulary entry is absent. Duplicates and unknown strings do not count as additional native commands, so **Add command** is hidden exactly when all nine vocabulary entries are present.
- When a role has no stored commands, show a muted `No commands` row above **Add command**. **Add command** is replaced in place by a `command…` dropdown listing only available commands in vocabulary order, followed by **Add** and **Cancel**. **Add** is disabled until selection, sends `add-command`, and closes the picker; **Cancel** closes it. Removing a row sends `remove-command`, which removes every stored copy. If another client already made the same edit, the server accepts it without writing or refusing; the card reflects the current state on its next publication. If a publication makes the selected option unavailable, clear that selection. If it leaves no available commands, close the picker; when the **Add command** button is absent, move focus to the `Commands` heading. If a publication removes a focused **Add command** opener because all nine commands became present, move focus to that heading.
- There is no loading or busy state. The server remains the source of truth; accepted edits appear through the next publication.
- Put picker focus handling in `web/src/plugins/roles/useRolePickerFocus.ts` and apply it to both the model and command pickers. Opening either picker focuses its first dropdown (the model picker's harness selector, or the command selector). Escape, **Add**, and **Cancel** close the picker and return focus to that section's **Add model** or **Add command** button. Escape does not raise an intent.
- The command dropdown's accessible name is `Command to add to role <name>`. Each command remove button has both title and label `Remove <command>`. The `Commands` heading can receive programmatic focus for the no-button state above. At narrow pane widths, command text wraps without pushing its remove button out of view; `roles.css` currently gives `.roles-entry` a single-line flex layout without an explicit wrapping rule, so add the CSS needed for this behavior instead of assuming it already exists.
- No new key binding or client-side persistence is introduced.

## Existing code to reuse

| Location | Existing behavior |
| --- | --- |
| `web/src/plugins/roles/RoleCard.tsx:26` (`RoleCard`), `:43-48` (`raise`), and `:79-194` (card, entry rows, and picker) | Keep role-level edits and drag handling here; extract the two sections so this component stays under the 200-line limit. |
| `web/src/plugins/roles/EntryPicker.tsx:7` (`EntryPicker`) | Reuse the harness/model/effort controls and selection behavior for **Add model**; add focus handling without changing model choice behavior. |
| `web/src/plugins/roles/roles.css:25-43` (`roles-entries`, `roles-entry`, `roles-picker`, and `roles-add-entry`) | Reuse row and picker styling, adding section, empty-state, command, and wrapping styles. |
| `web/src/plugins/roles/RolesTab.tsx:11-37` (`RolesTab`) | Forward the published native-command vocabulary with the role and model catalog. |
| `web/src/plugins/roles/RolesTab.test.tsx:13` (`makePayload`) and `web/src/plugins/roles/roles-dnd.test.tsx:10` (`payload`) | Update payload fixtures to include `nativeCommands`; use the published vocabulary in UI tests. |
| `src/plugins/roles/shared.ts:3-13` (`NATIVE_ACP_COMMANDS`) and `:21-37` (`Role`, `RolesPayload`) | Consume the server-owned vocabulary and required role/payload fields from completed subplan 1 through the client's `@shared/plugins/roles/shared` alias. |
| `product/specs/roles.md:62` (`What the tab shows`) | Extend the existing roles-tab spec with the UI behavior below. |

## Proposed changes

- Update `RolesTab.tsx` to pass `payload.nativeCommands` to `RoleCard`.
- Extract the current entry list, **Add model** button, and `EntryPicker` into `RoleModels.tsx`; keep the existing entry drag and effort intents intact. Add `RoleCommands.tsx` for the command section and `CommandPicker.tsx` for its dropdown and buttons. Keep command intent construction and refusal display in `RoleCard`, passed down as callbacks.
- Add `role-commands.test.ts` beside `role-commands.ts` for native ordering, duplicate adjacency, unknown-value order, picker options, and `canAddRoleCommand` with duplicates and unknown strings. Add `useRolePickerFocus.ts` for the shared open/initial-focus/close-and-restore behavior.
- Update `roles.css` for section headings, empty rows, command rows, and narrow-width command wrapping; retain the model row's drag, effort, and spacing behavior. Update `RolesTab.test.tsx` for the renamed model button and its `.roles-add-model` selector, both sections and empty states, exact list/dropdown/remove accessible names, vocabulary ordering, unknown values, available options, command intents and duplicate removal, the all-nine state, and both pickers' focus/Escape/restore behavior.
- Update `product/specs/roles.md` for the two sections, empty states, command ordering and unknown values, picker behavior, accessible names, focus behavior, and model button rename.

## Tests

- `web/src/plugins/roles/role-commands.test.ts`: native vocabulary order, adjacent duplicates, unknown strings last in stored order, options excluding already-present commands, and the add-button rule based on all nine distinct native values being present.
- `web/src/plugins/roles/RolesTab.test.tsx`: render both labelled sections and assert their exact names; show empty rows; dim and retain unknown commands; preserve duplicate rows; offer only unlisted commands; assert exact dropdown and remove-button names; send `add-command` and `remove-command`; remove every duplicate; hide **Add command** when all nine values are present even with extra duplicates or unknown values; verify each picker focuses its first dropdown, cancels on Escape, and restores focus after Add, Cancel, or Escape; and publish an update while the command picker is open to confirm a newly granted selection is cleared while remaining options stay available. Also verify that when a publication leaves no options, the picker closes and focus moves to the `Commands` heading, and that publication after adding the last command moves focus there when it removes the focused add button.
- Update its payload fixtures and `web/src/plugins/roles/roles-dnd.test.tsx` fixtures with the native vocabulary so the new section renders against the same contract as production.

## Verification

- Run `./scripts/run.mjs check-diff` after implementation changes and tests.
- Confirm all new modules stay under `web/src/plugins/roles/`, imports do not cross feature boundaries, and `RoleCard.tsx` remains under the configured 200-line limit.
- Manual check: open `roles` with the default roles file and confirm the `ask` card shows six grants and the `tell` card shows nine with no **Add command**. Confirm native order and unknown values remain visible as specified, remove a duplicated command and verify every copy disappears after publication, and use keyboard navigation to open each picker, Escape, and confirm focus returns to its own add button. Narrow the pane and confirm command text wraps while the remove control remains visible; also verify model effort controls and entry dragging still work.

## Out of scope

- Changing role persistence, the server-owned command vocabulary, or server intent behavior.
- Enforcing grants in the ACP tool table.
- Changing model ordering, effort editing, or drag behavior.
