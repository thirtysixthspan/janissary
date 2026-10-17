# Trash icon at the end of each schedules row

**Complexity: 3/10** — web-only. The trailing grid track that the previous change added is already in place, so the row action fills it. The delete path reuses the existing confirmation dialog and the cancel intent that the Delete/Backspace key already uses. No new capability, server change, or payload change.

Today a schedule row can only be deleted from the keyboard: select the row and press Backspace or Delete. The issue asks for a trash icon in each row, in an action column like the sessions tab, that deletes only the schedule in that row.

## Design decisions

- **Placement**: the icon sits in the trailing column of each row, under the section's header-row trash icon, in both the full and docked layouts. Each row is its own grid, so the fixed `1.5em` track keeps the icons aligned with the header icon.
- **Confirmation**: clicking the row icon opens the same `Delete schedule "<id>"?` dialog that the keyboard path opens, and only confirming sends the cancel. The sessions tab confirms its destructive row actions the same way, and a one-click delete would be easy to hit by accident. The issue's "only deletes the schedule in that row" is read as scope, not as skipping confirmation.
- **Target**: the dialog and the cancel act on the clicked row's own entry, not on whatever row is selected, so a click on a row's icon never deletes a different row.
- **Click handling**: the icon's click stops propagation, so pressing it does not also move the selection or focus the list, matching the sessions tab's row actions.
- **Layout parity**: the icon appears in the compressed layout too, since that layout already has the trailing track.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Keyboard delete → pending row → confirmation | `web/src/plugins/schedules/SchedulesTab.tsx` (`pendingDelete`, `confirmDelete`) | Clicking the icon sets the same pending row |
| Confirmation dialog | `web/src/plugins/schedules/DeleteScheduleDialog.tsx` | Unchanged |
| Cancel intent with owner identity | `web/src/plugins/schedules/SchedulesTab.tsx` (`confirmDelete`) | Unchanged |
| Trailing track in headings and rows | `web/src/plugins/schedules/schedules.css` | Row icon fills the track already reserved |
| Icon button style | `.schedules-clear` in `web/src/plugins/schedules/schedules.css` | Shared by the row icon |
| Row action stops propagation | `web/src/plugins/sessions/SessionRowActions.tsx` | Same click handling |

## Proposed changes

**Row markup.** In `web/src/plugins/schedules/SchedulesRows.tsx`, `ScheduleSection` gains an `onDelete: (entry: ScheduleRow) => void` prop, and each row ends with a `<button type="button" className="schedules-row-delete" aria-label={`Delete schedule ${entry.id}`}>` containing the trash icon. Its `onClick` calls `event.stopPropagation()` and then `onDelete(entry)`. The `faTrash` / `FontAwesomeIcon` imports are already in that file.

**Tab.** In `web/src/plugins/schedules/SchedulesTab.tsx`, pass `onDelete={setPendingDelete}` to both `ScheduleSection` renders. `confirmDelete` and the dialog are unchanged, so confirming sends the cancel for the clicked entry.

**Stylesheet.** In `web/src/plugins/schedules/schedules.css`, add `.schedules-row-delete` to the existing `.schedules-clear` rule so both icons share one style, and keep `justify-self: center`.

**Spec.** In `product/specs/scheduling.md`, in the "Scheduling tab" section:
- The sentence that says the content is read-only apart from "the one direct action below" becomes "the direct actions below".
- Add one sentence: each row ends in a trash icon that opens the same confirmation as Backspace/Delete for that row, and confirming deletes only that row's schedule, by key for a system row.

**User documentation.** In `documentation/user-documentation/automation/scheduling.md`, in the paragraph about selecting rows and deleting them, add that clicking the trash icon at the end of a row opens the same confirmation dialog for that row.

## Tests

- `web/src/plugins/schedules/SchedulesTab.test.tsx`, new cases:
  - clicking a row's trash icon opens `Delete schedule "<id>"?` for that row only, and confirming sends `cancel` with that row's `tab` and `id`, leaving the other row alone;
  - clicking the icon and then Cancel sends nothing;
  - the icon on a system row confirms with `owner: 'system'` and its `key`;
  - the icon click does not change the selection, checked by the row's `aria-selected` staying unchanged;
  - the icon is present in the compressed layout as well.
- `web/src/plugins/schedules/schedules-style.test.ts`: the row icon shares the `.schedules-clear` style rule.

Existing tests (keyboard delete, duplicate-system-key delete, clear, sections, ellipsis) must keep passing unchanged.

## Out of scope

- Changing the keyboard delete gesture or the dialog's wording.
- Any change to the header-row clear icons.
- Bulk selection or multi-row delete.
- Making the row icon visible only on hover. It stays visible, matching the sessions tab.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: open `schedules` with a system row and a tab row, click the trash icon on the tab row, confirm, and see only that row disappear. Repeat with Cancel and confirm nothing changes. Check the icon aligns with the header icon in both the full and docked layouts.
