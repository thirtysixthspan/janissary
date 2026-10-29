# SQL database browser

<img class="agent-float" src="/agents/aslan-south-west.png" alt="" />

The `sql` command opens a tab where you can look through one of your project's SQLite databases, filter and sort its tables, edit rows in place, and run your own statements:

```
sql shop
```

It works on the same databases the [`db` command](/user-documentation/command-bar/database) creates and queries. `db` is still the way to make a database, and it still prints its own text tables into a transcript. The browser is for when you want to see what's there before you know what to ask.

![The SQL browser on the shop database. The top row holds a database dropdown reading "shop" and a table dropdown reading "orders", with insert, columns, CSV, JSON, and split controls at the right. Below it the grid header reads "orders Rows 1–4 of 4 rows" above a Search every column field, then a four-row table with id, customer, status, and total columns, each header carrying sort arrows and a filter funnel, and one status cell showing a muted NULL.](/screenshots/sql-tab.png)

## Open a database

`sql <name>` opens that database's tab, or focuses it if it's already open. Each database gets one tab, named after it, so you can browse two side by side. Opening a tab again keeps its filters, search term, hidden columns, order, page, and exports.

Bare `sql` opens the database whose connection Janissary opened most recently. Any `db` command in any tab can open one, and so can opening a database in an SQL browser tab. Reaching a database that's already open doesn't move it up the order, and closing a connection takes that database out of the running. If no connection is open, bare `sql` opens the first database by name.

Add `left` or `right` as the last word to dock the tab into that sidebar: `sql shop left`, or `sql left` for the current database. Capital letters work too, so `sql shop LEFT` docks as well. Bare `sql` brings the current database's tab back to the center, while `sql shop` leaves that tab wherever it is.

`sql` never creates a database. Use `db sqlite create <name>` for that. These are the replies you can get instead of a tab:

| You type | You see |
|---|---|
| `sql nope` | `No database named "nope". Create it with: db sqlite create nope` |
| `sql` with no databases at all | `No databases. Create one with: db sqlite create <name>` |
| `sql ../other` | `Invalid database name "../other".` |

Because `left` and `right` are read as dock words when they come last, in any capitalization, a database actually named `left` or `right` can't be opened by name.

## Pick a table

<img class="agent-float left" src="/agents/hakim-south-east.png" alt="" />

The row across the top has two dropdowns. The database dropdown lists every database in the project, and marks the ones with an open connection with `•`. Choosing another database opens or focuses that database's own tab and leaves this one alone. The table dropdown lists the database's tables, views, indexes, and triggers under those four headings. You can choose a table or a view. Indexes and triggers are listed so you can see them, but you can't choose them.

Below the row, the grid header names what's on screen, or shows `—` when nothing is selected, and says how much of it there is, such as `Rows 1–100 of 4,213 rows`. It reads `Loading…` until the first page arrives, and `No tables.` for an empty database.

When the columns don't all fit across the tab, the widest values are cut off with an ellipsis so the table fits instead of scrolling sideways. A column whose values are all short keeps its width, and hovering a cut-off value shows it whole. A column never shrinks past its own name, so a table with more columns than the tab has room to name still scrolls sideways. The fit is worked out again when you resize or dock the tab, and the cell you're editing is never cut off.

When you choose a different table or view, the tab keeps what still applies. Filters, hidden columns, and a sort on a column the new table doesn't have are dropped, and so is a switched-off filter on such a column. Anything on a column it does have stays. The **Search every column** term names no column, so it stays too.

## Filter, sort, and page

Each column header has a filter button. It opens a row where you pick an operator and a value, then press **Apply** or `Return`. The operators are `contains` (the default), `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `notNull`. `isNull` and `notNull` need no value, so the value field disappears when you pick one. A column holds one filter at a time, so a new one replaces the old. Setting the same filter again removes it.

`contains` is a substring match, and a `%` or `_` in your value matches itself rather than acting as a wildcard. The comparison operators (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`) compare as a number when your value parses as one, and as text when it doesn't.

Every filter shows as a chip, such as `status = paid`, `total ≥ 10`, or `notes is null`. Double-click a chip to switch it off without losing it. A switched-off chip is greyed out and struck through, and double-clicking it again brings it back. **Clear filters** removes them all.

**Search every column** matches one term against every column of the row, so you can find a value without knowing which column holds it. Numbers are searched as text, and a null column simply doesn't match. Press `Return` to apply it. Its chip reads `matches "<term>" anywhere`, and a row has to match both the term and every column filter. Submit an empty term, or press **Clear**, to remove it.

Click a column header to sort by it: ascending, then descending, then back to the default order. Only one column sorts the grid at a time. With no sort chosen, rows are ordered by the table's primary key columns in key order, or by its first column when it has no primary key. Paging needs a fixed order, so the grid always sorts by something. Choosing another table drops a sort on a column the new table lacks, and that table falls back to its own default order. The **Columns** control lets you hide columns you don't need, and **Show all** brings them back. Its tooltip reads `Columns (2 hidden)` while any are hidden.

A column declared as a foreign key shows its values as links, titled with the table and column they point to, such as `customers.id`. Click one to open that table filtered to the row it names. That filter replaces any filter already on that column. Filters on other columns stay if the target table has those columns, and are dropped if it doesn't. A link takes you one step only, into the row the value names.

A null value has nothing to follow, so it shows as plain text. So does a column whose target can't be worked out, which happens when the key names no column and the other table's primary key isn't a single column. When a key spans several columns, every column of it links to the first target column.

Pages hold 50, 100, or 500 rows, and 100 is the default. The pager below the grid has **Previous**, **Next**, the page-size choice, and **Refresh**. While a filter is narrowing the table, the range line shows both totals, such as `Rows 1–2 of 3 of 51,882 rows`. The last figure is the whole table. Changing any filter, the search term, the sort, the hidden columns, or the page size returns you to the first page. **Refresh** reads the table again and keeps your page. The tab doesn't notice changes made elsewhere, such as a `db` command in another tab, until you press it.

## Edit rows

Double-click a cell to edit it. `Return` or clicking away saves the change, and `Escape` leaves it unchanged. A single click only highlights the row, so reading down a table never opens an editor. A null value shows as a muted `NULL`, so it never looks like an empty string. The editor has a **NULL** checkbox for writing a real null. A cell that holds null opens with the box checked, and typing clears it. There is no undo.

The editor opens with the value for that cell's named column, even if columns are hidden or reordered. A missing cell starts as empty text; a null cell starts as null.

While a cell save is pending, the editor is disabled and another save is ignored. If Janissary rejects the request, the editor stays open with your value so you can correct it or try again. After the request is accepted, a database error is reported in [Notifications](/user-documentation/tab-types/notifications).

**Insert row** opens a form headed `New row in <table>` with one field per column, the primary key marked `pk`. It shows the `INSERT` statement that **Save** will run. A column you leave empty is left out of that statement, so the table's own default applies. Each field has a **NULL** checkbox too, and the primary key's starts checked. A `NOT NULL` column with no default and nothing typed in it is refused by the database.

While **Save** is pending, the form is disabled and another submission is ignored. If Janissary rejects the request, the form stays open with its values so you can try again.

Each row has a **Delete row** button in its first column. It asks `Delete row from "<table>"?` before it deletes anything.

An edit to a row from a page the tab loaded long ago is refused with `That row is no longer loaded. Refresh and try again.` Press **Refresh** and make the change again.

### Read-only tables

Views can't be edited, and neither can tables without a primary key, because there is no safe way to address one row of them. The header says `Read-only: "<name>" is a view.` or `Read-only: "<name>" has no primary key.`, and the edit, insert, and delete controls disappear. You can still read, filter, export, and change them with your own statements.

A statement's result is read-only too. Double-clicking a cell does nothing there, even when the statement came from a table you could otherwise edit. See [Run your own SQL](#run-your-own-sql).

## Select and copy rows

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

Click anywhere in a row to highlight it. Shift-click, or move the pointer across rows with `Shift` held, to highlight a run. With the rows focused, `↑` and `↓` move the highlight, `Home` and `End` jump to the first and last row of the page, and `Shift` with any of those extends the run. `Escape` clears the highlight.

`Cmd+C` (or `Ctrl+C`) copies the highlighted rows as tab-separated text, one line per row with every column, including hidden ones. It copies only while the rows have the focus. With the console focused, the same keys copy whatever you've selected in the console. There's no header line, and a null copies as `NULL`, so it pastes cleanly into a spreadsheet. If the clipboard isn't available, the text appears in a band above the grid reading `Copy is unavailable here. Select and copy this text: …` so you can copy it yourself.

## Run your own SQL

The command line at the bottom of the tab is a SQL console, with the prompt `SQL >`. Type a statement and press `Return` to send it, or `Shift+Return` for a new line. A blank line does nothing. It's the only place in the tab where you type SQL.

A statement starting with `SELECT`, `PRAGMA`, `WITH`, or `EXPLAIN` is a read. Its result fills the grid, up to the first 200 rows, and the header reads `Read-only: this is a statement's result, not a table.` Changing a filter or the sort goes back to the selected table. Anything else is a write. When it succeeds, the tab reads itself again, so a `CREATE TABLE` or `ALTER TABLE` shows up in the table dropdown right away.

The console never prints results under the prompt. Instead, every statement reports to the [notifications](/user-documentation/tab-types/notifications) feed under the database's name. A write reports `OK.` A read reports `Query returned 12 rows.`, `Query returned 1 row.`, or `Query returned no rows.`, and the line carries a file icon that opens the whole result in an editor tab. A failed statement reports the SQLite error. A failure from the grid itself, like a failed page load or edit, is reported there once, not again until something succeeds.

The result file is a plain text file with the column names first, one tab-separated line per row, and a closing count such as `(12 rows)` or `(no rows)`. It's saved as `<database>-result-<timestamp>.txt` in `.janissary/db/exports/`, named for when the statement ran, so an older notification keeps opening its own result.

Two limits apply to a read. The grid shows only the first 200 rows. When a result is longer, the range line reads `First 200 rows of more than 200.` and **Next** stays disabled, because the grid has no second page of a console result. The file keeps up to 1,000,000 rows. Past that, the notification reads `Query returned more than 1,000,000 rows; the first 1,000,000 are in the file.` and the file ends with `(more than 1,000,000 rows, capped at 1,000,000)`. If Janissary can't write the file at all, the notification carries the result itself instead: the column names, the first 40 rows, and the real count. It has no file icon to click.

Your line stays in the console until Janissary accepts the statement. Then it clears and joins the recall list described below. Accepted only means the request arrived, not that the SQL worked, so the outcome comes back as a notification. While a request is pending, pressing `Return` again does nothing. If you type a newer line in the meantime, the older request being accepted leaves your newer text alone.

If Janissary rejects the request, a band above the grid reads `SQL request failed: <reason>` with a **Dismiss** button, and the line stays put so you can edit it or send it again. Janissary never retries on its own. The same band reports a rejected edit, insert, delete, or export.

`↑` and `↓` in the console walk back through the last 50 statements you sent from this tab, and a statement that starts with what you've typed appears ghosted after the cursor. Press `→` or `End` at the end of the line to accept it. A recalled statement lands in the line instead of running, so you can read and change it first. Statements the grid ran for itself aren't in that list.

The tab has two panes, the rows and the console, and a key belongs to whichever one has the focus. `↑` in the console recalls a statement and doesn't move the highlighted row. `Tab` moves focus from the console to the rows, and `Tab` again brings it back. Unlike the main command bar, `Tab` here doesn't complete anything. `Shift+Tab` isn't claimed by the tab, so it walks out as it does anywhere else.

## Export a table

The **CSV** and **JSON** buttons write the whole filtered and sorted table, not just the current page, into `.janissary/db/exports/` in your project. Each export gets its own numbered file, such as `shop-orders-1.csv`, and appears in the top row as a link for downloading. Hover the link to see its row count and size. A second export of the same table gets the next number and doesn't overwrite the first. The tab keeps links to its last five exports.

A CSV has a header row and one line per row. A field that holds a comma, a quote, or a line break is wrapped in quotes, and a quote inside it is doubled. A JSON export is an array of objects keyed by column name. In both formats a null is written as an empty string, and a binary value as base64. An export only reads the table, so a view or a table with no primary key can be exported too.

Both buttons are unavailable while the tab is waiting on another request, and while no table is selected. Two refusals are possible. An export of more than a million rows is refused with `Export too large: <n> rows (limit 1,000,000). Add a filter and try again.` An object whose name has no letter or digit in it is refused with `Cannot export "<name>": its name has no characters a file can carry.` In the file name, any character other than a letter, a digit, `.`, `_`, or `-` becomes `-`. A refusal is reported in [Notifications](/user-documentation/tab-types/notifications), once, like any other failure from the grid.

## When a database goes away

If you delete a database with `db sqlite delete` while its tab is open, the grid empties and the header reads `Database "<name>" does not exist. Create it to start.` Deleting also closes the database's connection, so it leaves `connection list` right away. **Refresh** gives you the same message. It doesn't bring the empty file back. Run `db sqlite create <name>` to make the database again.

## Close a database's connection

`connection close sqlite:<name>` closes the connection but leaves the database file alone. An open tab keeps showing what it last read. The next time the tab reads from the database, for example when you press **Refresh**, the connection opens again. Until then the database is missing from `connection list`. The browser doesn't add a row to the tab's own connections panel, even while the connection is open. See [Connections](/user-documentation/command-bar/connections).
