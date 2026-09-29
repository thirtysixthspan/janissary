<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Make Insert row open a reviewable form that previews its statement, instead of writing a row of nulls the moment the button is pressed.

Existing Issue: the grid's insert control sends `insert-row` with every column null on the click itself, so a row lands in the database before a value is typed and before any statement is shown, while DB Browser for SQLite's add-record dialog collects the values, previews the SQL that will run, and writes only on Save, having replaced the immediate-insert path for exactly this reason. Severity: 5/10

Existing Risk: 5/10 - A user who presses the button and changes their mind has already written a row of nulls, and one that survives a `NOT NULL` constraint is an error the user has to clean up by hand; the same press is one stray double-click away on a table the user did not mean to be editing.

Proposal Risk: 3/10 - Collecting values in a form delays the write behind a dialog, which is the right trade here but is a departure from the click-to-commit feel the rest of the grid has.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: make Insert row a reviewable form rather than an immediate write". Render an insert panel inside `DataGrid.tsx` — a row of inputs, one per column, defaulting to blank, each with a `Set NULL` toggle matching the one `CellEditor` already offers, and a Save and a Cancel control. Only Save sends `insert-row`, with the collected cells; Cancel sends nothing. Show the statement the save will run above the controls, built by adding `insertStatement(object, cells, columns)` to `src/plugins/sql/shared.ts` so the server and the client render it from one function and the preview cannot drift from what executes. Leave `src/database/write.ts` and the `insertRow` intent unchanged: the guard that already refuses an object the tab is not showing still applies, and the write layer has no view to consult. Cover the panel in `DataGrid.test.tsx` — that the button opens it without emitting anything, that Save emits `insert-row` with the collected cells, that Cancel emits nothing, and that the preview shows the statement — and cover `insertStatement` in `src/plugins/sql/shared.test.ts` for a full row, a row with a null, and a name needing a doubled quote.
