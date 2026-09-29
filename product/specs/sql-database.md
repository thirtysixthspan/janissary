# SQL database browser

A dockable tab that browses one of the project's SQLite databases: a schema navigator beside a data
grid, with filtering, ordering, paging, cell editing, row insert and delete, export, per-column
statistics, the SQL behind whatever the grid is showing, and a SQL console. Reached by the `sql`
command. It is a bundled tab plugin like the other file and list views, so everything about how it
is loaded, docked, and broken is described in [[tab-plugins]]; this describes what it does.

It reads and writes through the same connection registry `db sqlite query` uses, and it changes
nothing about that command's own output — the aligned text table a `db` invocation prints is
unchanged. See [[database]] for the registry, the name rules, and the file layout.

### The `sql` command

`sql` opens or focuses the tab for the most recently used database, creating it if it does not
exist. `sql <name>` opens or focuses that database's tab, and creates it if it does not exist — the
same thing `db sqlite create <name>` does. `sql <name> left` and `sql <name> right` dock that tab
into that sidebar, and a bare `sql` on a docked tab undocks it back to the centre. These are the
`schedules [left|right]` grammar, so a database actually named `left` or `right` is unreachable by
name.

With no database named and none open, `sql` reports `No databases. Create one with: db sqlite create
<name>`. A name the registry's own rule would refuse — anything with a `/`, a `..`, or a character
outside letters, digits, `-`, and `_` — is refused with `Invalid database name "<name>".` before
anything is opened.

One tab per database, named after it, so two databases can be browsed side by side and `sql notes`
twice focuses the tab already open rather than opening a second one. Reopening keeps that tab's
filters, page, and exports; the schema is re-read only when a `Refresh` is pressed.

### What the tab shows

In the centre the tab is a schema navigator beside the grid. Docked in a sidebar — which is narrow —
it is one column with a **Schema** / **Data** switch at the top. The plugin is told which it is and
lays itself out accordingly; it does not measure the frame around it.

The navigator lists every table, view, index, and trigger in the database, grouped in that order,
with each object's column count. A trigger is listed but not browsable, and its row says so rather
than doing nothing when pressed. An empty database reads `No tables.`

The grid's header names the object, reports how much of it is on screen, and carries the write
affordances. Below it, a filter chip row lists the filters in force; above the table, an error band
carries the last failure. Below the table, a pager steps a page at a time, offers a page size, and
re-reads on **Refresh**.

### Filtering, ordering, and paging

A filter is a column, an operator, and a value, chosen under the header it applies to. The
operators are `contains`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `notNull`; the last two
bind no value and hide the value field. Filtering the same column the same way again removes that
filter, so experimenting does not accumulate a list of them. **Clear filters** removes them all.

A column header toggles the order: ascending, then descending, then none. With no order chosen the
grid orders by the object's primary key, or by its first column when it has none — a page needs a
total order, or paging skips and repeats rows.

Pages hold 50, 100 (the default), or 500 rows. The pager reads `Rows 1–100 of 4,213 rows`, or
`Rows 1–2 of 3 of 51,882 rows` once a filter is narrowing something — a filtered view that reported
only the filtered total would read as though the table were that small. Changing the page size
returns to the first page. **Refresh** re-reads the schema and the current query.

Every value a filter, an order, or a write supplies is bound to the statement rather than
concatenated into it, and every object and column name comes from the database's own schema. A
filter value is compared as text, except in a comparison operator, where a value that parses as a
number binds as a number and one that does not binds as text. `contains` matches with `LIKE` and
escapes any `%` or `_` the value itself contains.

### Editing

Double-clicking a cell opens an editor; Enter commits it and Escape leaves it without changing
anything. A cell holds either text or null, and they are drawn differently: a null reads `NULL` in a
muted style rather than as a blank cell, so an empty string and a null are never confused. The
editor has a **NULL** toggle, so writing a null and writing the four characters `NULL` are two
different acts.

A write addresses one row by an identity the server issued when it returned the page. A client cannot
name a row it was not handed, cannot write its own `WHERE`, and a write naming a row whose page has
been superseded is refused with `That row is no longer loaded. Refresh and try again.` rather than
reaching a different row.

**Insert row** adds a row whose columns are all null, for the user to fill in and commit. **Delete
row** is on every row and asks first, through the application's own confirmation, naming the table.

A **view** is always read-only, and so is a **table with no primary key**: there is no statement
that can address one row of it rather than several, and `rowid` is not a safe answer because a
`VACUUM` reassigns it and a `WITHOUT ROWID` table has none. Such a table's header reads `Read-only:
"<name>" is a view.` or `Read-only: "<name>" has no primary key.` and offers no edit, insert, or
delete control at all. Its grid is otherwise ordinary, and the console still writes to it.

### The generated SQL

A **SQL** control opens a panel showing the exact statement that produced the grid, with `?` where a
value was bound, and the bound values listed beside it. It is deliberately not an inlined rendering:
a value containing a quote cannot be shown inside a statement safely, and a copy that quietly means
something else is worse than one that needs filling in. **Copy** puts both on the clipboard; **Run**
sends the statement through the console.

The order shown is the order actually used, including the primary-key fallback, so what the grid did
is never a surprise.

### Export

Exporting writes the whole filtered, ordered query — not one page — as CSV or JSON, to
`.janissary/db/exports/<database>-<object>-<n>.<ext>`, and the tab offers it as a download. A
second export of the same object gets the next number rather than overwriting the first. A CSV field
containing a comma, a quote, or a line break is quoted, and an interior quote is doubled.

An object whose name is not usable in a filename — anything holding a path separator, and a name left
with nothing a file could carry — is exported under a reduced name, and one left with nothing at all
is refused with `Cannot export "<name>": its name has no characters a file can carry.` The file
always lands inside the export directory, whatever the object is called.

An export over 1,000,000 rows is refused with `Export too large: <n> rows (limit 1,000,000). Add a
filter and try again.` rather than blocking the whole application while it is written.

### Statistics

A **Stats** control reads every column of the selected object: its null count, its distinct count,
the minimum and maximum when it is numeric, and — when it has twenty or fewer distinct values — one
bar per value scaled to the largest. A column with more distinct values than that gets its count and
a line saying it has too many to chart. It is read when asked, never on a refresh.

### The console

The tab's bottom line is the application's own command bar, so it looks and behaves like every other
line of text in the application, and Shift+Enter starts a new line. Enter sends what is typed, and
the host decides whether that was a read or a write by the same test `db sqlite query` uses: a
statement that returns rows fills the grid, and anything else reports `OK.`, or the SQLite error.
Enter's own history is the last fifty statements in this tab.

A statement that fails shows its message and leaves the grid as it was. Nothing a grid or a console
does disables the plugin, and nothing is written to a transcript.

### What it does not do

- It browses only the project's own databases, by name. A `.sqlite` file anywhere else on disk is
  not reachable, because the registry derives every path from a validated name.
- It does not change a schema from the grid. The console is the way to run `CREATE`, `ALTER`, or
  `DROP`, exactly as `db sqlite query` already is.
- It does not join tables, follow a foreign key, or build a query.
- It does not watch other tabs. A `db` command run elsewhere that changes the data leaves this view
  showing what it last read, which is what **Refresh** is for.
- It does not undo. A cell edit commits or it does not.
- It adds no `sqlite:` row to the tab's own connections panel: a plugin tab runs no `db` command, so
  the tab is not credited with the connection. The connection is global, so the database appears in
  `connection list` and in tab-completion app-wide, and `connection close sqlite:<name>` closes it.
