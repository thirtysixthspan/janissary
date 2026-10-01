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

Bare `sql` opens the database you reached most recently, whether you reached it with `sql` or with a `db` command in any tab. If you haven't reached one yet, it opens the first database by name. Add `left` or `right` as the last word to dock the tab into that sidebar: `sql shop left`, or `sql left` for the current database. Bare `sql` brings a docked tab back to the center.

`sql` never creates a database. Use `db sqlite create <name>` for that. These are the replies you can get instead of a tab:

| You type | You see |
|---|---|
| `sql nope` | `No database named "nope". Create it with: db sqlite create nope` |
| `sql` with no databases at all | `No databases. Create one with: db sqlite create <name>` |
| `sql ../other` | `Invalid database name "../other".` |

Because `left` and `right` are read as dock words when they come last in lower case, a database actually named `left` or `right` can't be opened by name.

## Pick a table

<img class="agent-float left" src="/agents/hakim-south-east.png" alt="" />

The row across the top has two dropdowns. The database dropdown lists every database in the project, and marks the ones with an open connection with `•`. Choosing another database opens or focuses that database's own tab and leaves this one alone. The table dropdown lists the database's tables, views, indexes, and triggers under those four headings. You can choose a table or a view. Indexes and triggers are listed so you can see them, but you can't choose them.

Below the row, the grid header names what's on screen and how much of it there is, such as `Rows 1–100 of 4,213 rows`. It reads `Loading…` until the first page arrives, and `No tables.` for an empty database.

## Filter, sort, and page

Each column header has a filter button. It opens a row where you pick an operator and a value, then press **Apply** or `Return`. The operators are `contains` (the default), `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `notNull`. A column holds one filter at a time, so a new one replaces the old. Setting the same filter again removes it.

Every filter shows as a chip, such as `status = paid` or `total ≥ 10`. Double-click a chip to switch it off without losing it. A switched-off chip is greyed out and struck through, and double-clicking it again brings it back. **Clear filters** removes them all.

**Search every column** matches one term against every column of the row, so you can find a value without knowing which column holds it. Press `Return` to apply it. Its chip reads `matches "<term>" anywhere`, and a row has to match both the term and every column filter. Submit an empty term, or press **Clear**, to remove it.

Click a column header to sort by it: ascending, then descending, then back to the default order. Only one column sorts the grid at a time. With no sort chosen, rows are ordered by the table's primary key. The **Columns** control lets you hide columns you don't need, and **Show all** brings them back. Its tooltip reads `Columns (2 hidden)` while any are hidden.

A column declared as a foreign key shows its values as links, titled with the table and column they point to. Click one to open that table filtered to the row it names.

Pages hold 50, 100, or 500 rows, and 100 is the default. The pager below the grid has **Previous**, **Next**, the page-size choice, and **Refresh**. While a filter is narrowing the table, the range line shows both totals, such as `Rows 1–2 of 3 of 51,882 rows`. The last figure is the whole table. Changing any filter, the search term, the sort, the hidden columns, or the page size returns you to the first page. **Refresh** reads the table again and keeps your page. The tab doesn't notice changes made elsewhere, such as a `db` command in another tab, until you press it.

## Edit rows

Double-click a cell to edit it. `Return` or clicking away saves the change, and `Escape` leaves it unchanged. A null value shows as a muted `NULL`, so it never looks like an empty string. The editor has a **NULL** checkbox for writing a real null. A cell that holds null opens with the box checked, and typing clears it. There is no undo.

**Insert row** opens a form headed `New row in <table>` with one field per column, the primary key marked `pk`. It shows the `INSERT` statement that **Save** will run. A column you leave empty is left out of that statement, so the table's own default applies. Each field has a **NULL** checkbox too, and the primary key's starts checked. A `NOT NULL` column with no default and nothing typed in it is refused by the database.

Each row has a **Delete row** button in its first column. It asks `Delete row from "<table>"?` before it deletes anything.

An edit to a row from a page the tab loaded long ago is refused with `That row is no longer loaded. Refresh and try again.` Press **Refresh** and make the change again.

### Read-only tables

Views can't be edited, and neither can tables without a primary key, because there is no safe way to address one row of them. The header says `Read-only: "<name>" is a view.` or `Read-only: "<name>" has no primary key.`, and the edit, insert, and delete controls disappear. You can still read, filter, export, and change them with your own statements.

## Select and copy rows

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

Click anywhere in a row to highlight it. Shift-click, or move the pointer across rows with `Shift` held, to highlight a run. With the rows focused, `↑` and `↓` move the highlight, `Home` and `End` jump to the first and last row of the page, and `Shift` with any of those extends the run. `Escape` clears the highlight.

`Cmd+C` (or `Ctrl+C`) copies the highlighted rows as tab-separated text, one line per row with every column, including hidden ones. There's no header line, and a null copies as `NULL`, so it pastes cleanly into a spreadsheet. If the clipboard isn't available, the text appears in a band above the grid reading `Copy is unavailable here. Select and copy this text: …` so you can copy it yourself.

## Run your own SQL

The command line at the bottom of the tab is a SQL console, with the prompt `SQL >`. Type a statement and press `Return` to run it, or `Shift+Return` for a new line. It's the only place in the tab where you type SQL.

A statement starting with `SELECT`, `PRAGMA`, `WITH`, or `EXPLAIN` is a read. Its result fills the grid, up to the first 200 rows, and the header reads `Read-only: this is a statement's result, not a table.` Changing a filter or the sort goes back to the selected table. Anything else is a write. When it succeeds, the tab reads itself again, so a `CREATE TABLE` or `ALTER TABLE` shows up in the table dropdown right away.

The console never prints results under the prompt. Instead, every statement reports to the [notifications](/user-documentation/tab-types/notifications) feed under the database's name. A write reports `OK.` A read reports `Query returned 12 rows.`, `Query returned 1 row.`, or `Query returned no rows.`, and the line carries a file icon that opens the whole result in an editor tab. A failed statement reports the SQLite error. A failure from the grid itself, like a failed page load or edit, is reported there once, not again until something succeeds.

`↑` and `↓` in the console walk back through the last 50 statements you sent from this tab, and a statement that starts with what you've typed appears ghosted after the cursor. `Tab` moves focus between the console and the rows.

## Export a table

The **CSV** and **JSON** buttons write the whole filtered and sorted table, not just the current page, into `.janissary/db/exports/` in your project. Each export gets its own numbered file, such as `shop-orders-1.csv`, and appears in the top row as a link for downloading. The tab keeps links to its last five exports. In both formats a null is written as an empty string. An export of more than a million rows is refused with `Export too large: <n> rows (limit 1,000,000). Add a filter and try again.`

## When a database goes away

If you delete a database with `db sqlite delete` while its tab is open, the grid empties and the header reads `Database "<name>" does not exist. Create it to start.` The browser doesn't add a row to the tab's own connections panel. The database still shows in `connection list`, and `connection close sqlite:<name>` closes it. See [Connections](/user-documentation/command-bar/connections).
