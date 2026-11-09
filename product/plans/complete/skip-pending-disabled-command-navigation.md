# Skip pending-disabled toggles during Commands tab keyboard navigation

Issue: `moveCommandFocus` only knows the static parent and agent disabled states, not the pending set, so while a save is in flight an Up or Down can target a checkbox disabled by `enabledPending` or `agentPending`; `focus()` on a disabled input does nothing, leaving focus where it was instead of falling back or skipping.

Complexity rating: 3/10

## Goal

Make Commands tab keyboard navigation honor the same pending-disabled state that already disables the checkboxes. A pending-disabled matching toggle falls back to that row's Enabled toggle when Enabled is available, and the row is skipped when Enabled is pending-disabled too, so focus always lands on a control that can actually take it.

## Approach

Thread an `isToggleDisabled(row, column)` predicate from `CommandsTab` into `moveCommandFocus` and `targetColumn`, passing the `isPending` function returned by `useCommands`. `targetColumn` treats a matching toggle reported by the predicate exactly like the existing static disabled state: the Agent access target falls back to Enabled, and the row is skipped when Enabled is also unavailable. Static parent and agent disabled checks keep their current precedence, and the existing navigation tests continue to cover those branches unchanged apart from supplying a no-pending predicate.

## Implementation steps

1. In `web/src/plugins/commands/commands-keys.ts`, add an exported `CommandToggleDisabled` function type and give `targetColumn` and `moveCommandFocus` an `isToggleDisabled` parameter. In `targetColumn`, reject the Agent access target when `isToggleDisabled(row, 'agentAccess')` is true, and return `null` when `isToggleDisabled(row, 'enabled')` is true instead of `'enabled'`.
2. In `web/src/plugins/commands/CommandsTab.tsx`, pass `isPending` as the fourth argument to `moveCommandFocus`.
3. Add `web/src/plugins/commands/commands-keys.test.ts` cases for a pending-enabled row that is skipped and a pending-agent row that falls back to Enabled, plus a row where both are pending and skipped.
4. Add `web/src/plugins/commands/CommandsTab.test.tsx` cases that click a toggle against a deferred save, press ArrowDown and ArrowUp while the save is pending, and assert focus skips the pending-enabled rows or lands on the Enabled fallback for a pending Agent access toggle.
5. Update the keyboard paragraph in `product/specs/commands-tab.md` to state that pending-disabled toggles count as unavailable.
6. Remove the resolved entry from `product/backlog/pull-request.md`, preserving the other entries.
7. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/commands/commands-keys.test.ts`: a row whose Enabled toggle is pending is skipped; a row whose Agent access toggle is pending falls back to its Enabled toggle; a row whose Agent access and Enabled toggles are both pending is skipped.
- `web/src/plugins/commands/CommandsTab.test.tsx`: clicking Enabled for `ask` and moving Up or Down while the deferred save is pending skips both `ask` rows and lands on the adjacent non-pending row; clicking Agent access for a native row and moving Down while pending lands on that row's Enabled toggle.
- Existing static disabled navigation tests in both files continue to pass.

## Specs and docs

- `product/specs/commands-tab.md`: the Keyboard and layout paragraph says a pending-disabled matching toggle falls back to Enabled, and rows whose Enabled toggle is also pending-disabled are skipped.
- No help or user-documentation change: `documentation/user-documentation/tab-types/commands.md` already describes the checkboxes as unavailable while a save is pending and navigation as falling back when a checkbox is unavailable.

## Out of scope

- Changing static parent or agent disabled semantics, or the checkbox rendering in `CommandRow.tsx`.
- Changing pending tracking in `useCommands.ts`.
- Any other backlog entry.
