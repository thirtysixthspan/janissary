<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Let a cell or a run of cells be copied to the clipboard, so a value can leave the grid without being retyped.

Existing Issue: the grid has no copy path at all — `CellEditor` commits and cancels, and nothing reads a selection — while DB Browser for SQLite's data grid carries a custom `copyMimeData()` and `paste()` so a selection can be lifted out of the browser and into a spreadsheet. Severity: 5/10

Existing Risk: 5/10 - Every value a user wants anywhere else is retyped by hand, and retyping a primary key or an account number is exactly the step that introduces the typo this feature's whole safe-editing design exists to prevent.

Proposal Risk: 2/10 - Copy is unambiguous but paste is not, and a paste that writes a range needs its own addressing story; copying alone adds no such risk.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: let a grid selection be copied to the clipboard". Add a `selectionToTsv` helper to `web/src/plugins/sql/grid-view.ts` that turns a rectangular selection of cells into tab-separated text, using the same null rendering `cellText` already applies, so a copied selection reads exactly as the grid shows it. Wire a copy control in the grid bar in `DataGrid.tsx` and a window-level listener gated on `capabilities.active`, because a plugin tab stays mounted while hidden and a listener that ignored that would copy from a tab the user is not looking at — the same reason the plugin contract says a window-wide listener must consult `active`. Write through `navigator.clipboard.writeText`, and fall back to showing the text in the error band when the clipboard is unavailable rather than silently doing nothing. Selection tracking stays in the component, since it is view state and the payload does not need it. Cover the helper in `grid-view.test.ts` for a single cell, a rectangular run, a null inside a run, and an empty selection, and cover the control in `DataGrid.test.tsx` that it writes the rendered text. Do not add paste: a pasted range needs its own key addressing, and copying is the half that has no such question.


* Keep a record of the statements the tab has run, so an edit session can be read back instead of reconstructed from memory.

Existing Issue: the tab reports only the most recent statement — `SqlConsoleResult` in `src/plugins/sql/shared.ts` holds one `sql` and one `changed` count, and `fold` overwrites it on every write — while DB Browser for SQLite lists "Examine a log of all SQL commands issued by the application" among its headline capabilities and logs each one with its outcome. Severity: 6/10

Existing Risk: 6/10 - A user who made three edits in a table and wants to know what happened has nothing to read, and this browser is the only surface that mutates data in the application, so it is the only place a record of what was written could live.

Proposal Risk: 2/10 - The log grows with use, so it needs a stated cap and a way to clear it, and it is one more list in a payload that is already the tab's whole state.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: keep a log of the statements the tab has run". Replace `console: SqlConsoleResult | null` on `SqlPayload` in `src/plugins/sql/shared.ts` with `log: SqlConsoleResult[]`, newest first, capped at fifty with the cap named as a constant beside `MAX_EXPORTS` in `src/plugins/sql/tabs.ts` — the same cap the console's own recall history uses, so the two agree. Have `fold` in `src/plugins/sql/fold.ts` prepend rather than replace, so the tab's whole write session is readable, and add a `clear-log` intent in `src/plugins/sql/intents.ts` with an empty-payload guard beside the others. Render it in the SQL drawer in `SqlDrawer.tsx`, which already shows one statement and its parameters: the current statement stays where it is, and the rest become a list above it, each entry showing its statement, the changed count, or its error, and each carrying a Copy control so one can be lifted without selecting it. `renderRunnableSql` from the drawer's existing helper is what makes an entry worth copying, so a logged write shows its bound values the same way the grid's statement does. Cover the prepend, the cap, and the eviction in `src/plugins/sql/activate.test.ts` by folding more than fifty writes, and cover the clear in the same file. `SqlDrawer.test.tsx` gains a case that three logged entries render and that Copy writes one of them.


* Make Insert row open a reviewable form that previews its statement, instead of writing a row of nulls the moment the button is pressed.

Existing Issue: the grid's insert control sends `insert-row` with every column null on the click itself, so a row lands in the database before a value is typed and before any statement is shown, while DB Browser for SQLite's add-record dialog collects the values, previews the SQL that will run, and writes only on Save, having replaced the immediate-insert path for exactly this reason. Severity: 5/10

Existing Risk: 5/10 - A user who presses the button and changes their mind has already written a row of nulls, and one that survives a `NOT NULL` constraint is an error the user has to clean up by hand; the same press is one stray double-click away on a table the user did not mean to be editing.

Proposal Risk: 3/10 - Collecting values in a form delays the write behind a dialog, which is the right trade here but is a departure from the click-to-commit feel the rest of the grid has.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: make Insert row a reviewable form rather than an immediate write". Render an insert panel inside `DataGrid.tsx` — a row of inputs, one per column, defaulting to blank, each with a `Set NULL` toggle matching the one `CellEditor` already offers, and a Save and a Cancel control. Only Save sends `insert-row`, with the collected cells; Cancel sends nothing. Show the statement the save will run above the controls, built by adding `insertStatement(object, cells, columns)` to `src/plugins/sql/shared.ts` so the server and the client render it from one function and the preview cannot drift from what executes. Leave `src/database/write.ts` and the `insertRow` intent unchanged: the guard that already refuses an object the tab is not showing still applies, and the write layer has no view to consult. Cover the panel in `DataGrid.test.tsx` — that the button opens it without emitting anything, that Save emits `insert-row` with the collected cells, that Cancel emits nothing, and that the preview shows the statement — and cover `insertStatement` in `src/plugins/sql/shared.test.ts` for a full row, a row with a null, and a name needing a doubled quote.
