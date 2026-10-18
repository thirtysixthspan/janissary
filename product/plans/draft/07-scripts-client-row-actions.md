# Scripts tab row actions and delete dialog
**Complexity: 3/10** — a three-button action column and a confirmation dialog that copies the schedules dialog's keyboard contract, plus the selection rule that keeps the highlight on the next row after a delete.

## Goal

Add the per-row action column with Run, Duplicate, and Delete. Add the Delete and Backspace path into a confirmation dialog with the spec's wording. Move the selection after a confirmed delete, so the next row stays highlighted when the list drops the deleted one.

## Design decisions and dependencies

This subplan depends on `06-scripts-client-list` for the row component, the selection model, and the `ScriptsTab` key handler, and on `05-scripts-plugin-server` for the intent names and payload guards.

- Run sends `execute` with `{ name }`. Duplicate sends `clone` with `{ name }`. Delete opens the dialog. The icons are `faPersonRunning`, `faClone`, and `faTrashCan` from `@fortawesome/free-solid-svg-icons`, which are installed. The tooltips are exactly `Run`, `Duplicate`, and `Delete`.
- The `aria-label` for each button carries the verb and the name, such as `Run deploy`, so a screen reader names the row. The source plan fixes the tooltips and says nothing about accessible names, so this is a decision made here. It is flagged for the owner.
- A click on a row button stops propagation, so pressing a button does not change the selection.
- The dialog's text is a pure function of the fields the server sends for the row. The title is `Delete runscript "<name>"?`. When `schedules` is 1, the first line is `Used by 1 system schedule. It will fire as missing after this.` When it is above 1, the line reads `Used by <n> system schedules. They will fire as missing after this.` When `open` is true, the second line is `Open in an editor tab. The tab keeps its text.` The source plan says the dialog's lines "come from the server", and it also says the tests read them "from the row". The server sends counts and flags, and this module turns them into words. The server sends no prose. This is a reading of the source plan, and it is flagged for the owner.
- The dialog copies the keyboard contract of the schedules delete dialog. Y and N work, Enter runs the selected button, Escape cancels, Left and Right toggle between the two buttons, Cancel starts selected, and clicks outside the dialog are swallowed. A plugin may not import the host confirm shell or the schedules dialog, so the contract is written again here. The source plan puts this dialog beside the tab, and the copy follows that. The React organization guideline says to promote a shared module when a second feature needs it. This copy is kept because the title and the identity line differ, but whether to promote it is a call for the owner, and it is recorded in the spec.
- Confirming the dialog sends `delete` with `{ name }`. Before sending, the selection moves to the next row in the current order, or to the previous row when the deleted row was last. Because selection is held by name, the highlight stays on that next name when the next list send drops the deleted row. If the delete later fails, the row stays and the highlight is on the next row. That is acceptable, and the feed explains the failure.
- Delete or Backspace with no selection does nothing, as the source plan says.
- Cancel, Escape, and a click outside leave the file in place and send nothing.
- A row whose file has gone is removed by the next list send, which is what the source plan requires. The client adds no logic for it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Schedules delete dialog | `web/src/plugins/schedules/DeleteScheduleDialog.tsx` | Keyboard contract and markup are copied, not imported. |
| Schedules row trash button | `web/src/plugins/schedules/SchedulesRows.tsx` | Pattern for a row button that stops propagation. |
| Icon action column | `web/src/plugins/sessions/SessionRowActions.tsx` | Pattern for icon-only buttons with `title`, `aria-label`, and `data-action`. Not imported. |
| Selection movement | `web/src/plugins/api.ts` (`nextListSelection`) | Reused through `06`'s keys module. |
| Icons | `@fortawesome/free-solid-svg-icons` | `faPersonRunning`, `faClone`, `faTrashCan`. |
| Shared intent contract | `src/plugins/scripts/shared.ts` (from `05`) | Payload types for `execute`, `clone`, `delete`, and `open`. |

## Proposed changes

- `web/src/plugins/scripts/ScriptRowActions.tsx` (new): renders the three buttons for one row. Each button has `data-action`, `title`, and an `aria-label` that names the row, and each click stops propagation and calls a handler.
- `web/src/plugins/scripts/DeleteScriptDialog.tsx` (new): the modal with the title, the two optional lines, and the Delete and Cancel buttons, plus the keyboard and click-outside handling described above.
- `web/src/plugins/scripts/scripts-delete-text.ts` (new): pure functions that return the title and the optional lines for a given name, schedule count, and open flag.
- `web/src/plugins/scripts/ScriptRows.tsx` (from `06`): each row gains the `ScriptRowActions` column, rendered after the name and the clock marker.
- `web/src/plugins/scripts/ScriptsTab.tsx` (from `06`): Delete and Backspace open the dialog for the selected row. Confirming sends `delete`, moves the selection first, and clears the dialog. The Run and Duplicate handlers send `execute` and `clone`.
- `web/src/plugins/scripts/scripts.css` (from `06`): styles for the action column and the dialog's use of the shared modal classes.

## Tests

- In `web/src/plugins/scripts/ScriptRowActions.test.tsx` (new): Run sends `execute` with the row's name. Duplicate sends `clone` with the row's name. Delete opens the dialog and sends nothing. A button click does not change the selection. The three tooltips are exactly `Run`, `Duplicate`, and `Delete`.
- In `web/src/plugins/scripts/scripts-delete-text.test.ts` (new): the title for a name. The schedule line for 0, 1, and 2 schedules, with the singular and plural forms. The open line for `open` true and false.
- In `web/src/plugins/scripts/DeleteScriptDialog.test.tsx` (new): the title and lines render from the given values. Delete confirms. Cancel, Escape, and N close without sending. Y confirms. Enter runs the selected button, and Left and Right toggle it. A click outside the dialog is swallowed and does nothing else.
- In `web/src/plugins/scripts/ScriptsTab.test.tsx` (from `06`, extended):
  - Delete and Backspace with no selection open nothing.
  - Delete with a selection opens the dialog for that name.
  - Confirming a delete sends `delete` with that name.
  - After a confirmed delete of a row in the middle of the list, the selection moves to the next row.
  - After a confirmed delete of the last row, the selection moves to the previous row.
  - After a rerender that drops the deleted name, the highlight is still on the next name.

## Verification

Run `./scripts/run.mjs check-diff`. Check by reading the files that the dialog and the action column import nothing from `../schedules` or `../sessions`, which lint rejects.

## Out of scope

- The server actions the buttons trigger. Those are in `04`.
- Registry and loader entries. Those are in `08`.
- Promoting the dialog into a shared module. The owner decides that after this lands.
- Rename, edit from a row, and scheduling from the tab.
