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

`sql` opens or focuses the tab for the database it most recently opened a connection to, which is the
one the command was last pointed at. `sql <name>` opens or focuses that
database's tab, and refuses a name the registry has never heard of with
`No database named "<name>". Create it with: db sqlite create <name>` — a typed command is far more
likely to carry a typo than a wish for a new database, so it does not create one. A database is made
with `db sqlite create <name>`, or from the tab's own database switcher, which does create it.
`sql <name> left` and `sql <name> right` dock that tab into that sidebar, and a bare `sql` on a docked
tab undocks it back to the centre. These are the `schedules [left|right]` grammar, so a database
actually named `left` or `right` is unreachable by name.

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

A filter belongs to a column of one object, so selecting a different object drops the filters naming
columns it does not have — keeping them would build a statement naming a column that is not there.
A filter on a column the new object does have stays, and an object the tab has never listed has no
known columns and so keeps everything.

**Search every column** takes one term and matches it against the whole row, so a value can be found
without knowing which column holds it. It is the other order of narrowing — a per-column filter is
asked when the column is known, and this when it is not — so it sits above the per-column chips. Each
column contributes its own match and they are joined with `OR`, with every value rendered as text
first so a number and a string are searched alike, and a null column passing rather than hiding the
row. The term is its own group, so a row must match the term *and* every per-column filter. It names
no column, so it survives a switch to another object. Submitting an empty term removes it, and
**Clear filters** takes it away with the rest. It is not the statistics panel's business: those
counts are the object's, and the term does not reach them.

A **Columns** control in the grid's action bar lists the object's columns, each one toggling, with
**Show all** to take them all back. A wide table is otherwise only usable by horizontal scrolling, and
a dock or a split pane leaves little width to scroll within. Hiding a column does not change the
query: it is still selected and still filtered, so this is about which columns are on screen, not
which rows come back. The control says how many are hidden. Like a filter, a hidden column belongs to
one object, so selecting another object drops the ones it does not have.

A column header toggles the order: ascending, then descending, then none. With no order chosen the
grid orders by the object's primary key, or by its first column when it has none — a page needs a
total order, or paging skips and repeats rows.

A column declared as a foreign key shows its value as a control rather than as text, titled with the
table and column it points at. Activating it selects that table filtered to the value, replacing any
existing filter on that column and leaving filters on other columns alone. The filter travels inside
the selection, not as a second action, because the grid's actions are answered against the state
before the last one landed. A composite key follows on its first target column alone, and offers
nothing to follow when the value is null, or when the referenced table's own key could not be
resolved to a single column — following an unresolved key would filter on nothing and look broken.

Pages hold 50, 100 (the default), or 500 rows. The pager reads `Rows 1–100 of 4,213 rows`, or
`Rows 1–2 of 3 of 51,882 rows` once a filter is narrowing something — a filtered view that reported
only the filtered total would read as though the table were that small. The second figure counts the
object with no filters at all, so it is right even when the first query for an object arrives
already filtered, as following a key into an unvisited table does. Changing the page size
returns to the first page. **Refresh** re-reads the schema and the current query.

A **Row** field beside the range label jumps to a row the user names, so a table far larger than a
page is reachable without counting. It numbers rows from 1 because the range label does, so a number
read off the label and typed back lands on that row. A row past the end lands on the last page
rather than on an empty one — a number the user got wrong should show them the end, not look like
the table is empty — and the range label is left where it is so they can see where they arrived. A
number that is not a whole row above zero asks for nothing, and the control stays disabled.

Every value a filter, an order, or a write supplies is bound to the statement rather than
concatenated into it, and every object and column name comes from the database's own schema. A
filter value is compared as text, except in a comparison operator, where a value that parses as a
number binds as a number and one that does not binds as text. `contains` matches with `LIKE` and
escapes any `%` or `_` the value itself contains.

### Editing

Double-clicking a cell opens an editor; Enter commits it and Escape leaves it without changing
anything. The grid also answers the keyboard on its own: the arrow keys move a visible cursor, `Home`
and `End` reach the ends of its row, `Enter` opens the editor on the cell it is on, and `Escape`
leaves it. Moving stops at the edges rather than wrapping, and the cursor is forgotten when a new
page arrives, so it never sits on cells that now hold other values. `Tab` is left to the application,
which walks out of the tab as it does from anywhere else. A cell holds either text or null, and they
are drawn differently: a null reads `NULL` in a muted style rather than as a blank cell, so an empty
string and a null are never confused. The editor has a **NULL** toggle, so writing a null and writing
the four characters `NULL` are two different acts. The toggle is part of the value being edited rather
than a write of its own — it takes effect when the editor commits, the same way the typed text does,
and leaving it with Escape changes nothing.

A write addresses one row by an identity the server issued when it returned the page. A client cannot
name a row it was not handed, cannot write its own `WHERE`, and a write naming a row whose page has
been superseded is refused with `That row is no longer loaded. Refresh and try again.` rather than
reaching a different row.

**Insert row** opens a form with one input per column, the statement the save will run shown above the
controls, and a Save and a Cancel. Nothing is written until Save, and a column the user leaves alone
is sent as null rather than as an empty string, so it takes the database's own default. Each input
carries a **NULL** toggle matching the cell editor's, and it is on until the user turns it off — a
blank string and an explicit null are different values, so the distinction is a control rather than a
convention about typing nothing. A field whose column is null is disabled, so a typed value cannot
silently contradict the toggle beside it. **Delete row** is on every row and asks first, through the
application's own confirmation, naming the table.

A run of cells is copied as tab-separated text, one line per row, from **Copy selection** or from
the platform's own copy key. A spreadsheet pastes it as a table with no quoting rules to disagree
about, so a value holding a comma cannot change the shape of what lands. A null copies as the `NULL`
the grid shows rather than as an empty cell the paste would turn back into a string, and a range that
runs off the end of the page copies only what was on screen. Selection is a rectangle: a click starts
one and a shift-click or a drag extends it, and dragging back over the start selects the same cells
as dragging away from it. A new page forgets the selection, so cells are never marked that now hold
other values. A text selection the browser has made inside a cell is left alone, so copy still gets
the word. If the system clipboard is unavailable, the text is shown in the error band rather than
being dropped.

A **view** is always read-only, and so is a **table with no primary key**: there is no statement
that can address one row of it rather than several, and `rowid` is not a safe answer because a
`VACUUM` reassigns it and a `WITHOUT ROWID` table has none. Such a table's header reads `Read-only:
"<name>" is a view.` or `Read-only: "<name>" has no primary key.` and offers no edit, insert, or
delete control at all. Its grid is otherwise ordinary, and the console still writes to it.

### The generated SQL

A **SQL** control opens a panel showing the exact statement that produced the grid, with `?` where a
value was bound, and the bound values listed beside it. It is deliberately not an inlined rendering:
a value containing a quote cannot be shown inside a statement safely, and a copy that quietly means
something else is worse than one that needs filling in. **Copy** puts both on the clipboard.

**Run** sends the statement *with those values written in* — a text value quoted, a number bare — so
running a filtered grid's statement runs that query rather than one comparing against nulls. The
panel keeps showing the placeholder form, because that is the statement that actually ran.

The order shown is the order actually used, including the primary-key fallback, so what the grid did
is never a surprise.

Above it, the statements the tab has run — newest first, capped at fifty, each showing what it
changed or the error that stopped it, and each with its own **Copy**. A statement that failed is
logged too: a record of only the successes would not say what happened. This browser is the only
surface that mutates data, so a log of what was written can live nowhere else. **Clear log** empties
it without re-reading, since nothing on screen changes when a record of the past is discarded. The
console's own line under the prompt reports the newest entry, which is why there is no separate field
for it — one list means the line and the history cannot disagree.

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

A read fills the grid with the first two hundred rows it returns. A result longer than that is cut
off there and the range line says so rather than reporting a table of two hundred, because a query
the console refused to finish is not the same thing as a small one.

A statement that fails shows its message and leaves the grid as it was. Nothing a grid or a console
does disables the plugin, and nothing is written to a transcript.

A database deleted by `db sqlite delete` while its tab is open is not an ordinary read failure. The
tab drops the grid and reads `Database "<name>" does not exist. Create it to start.` rather than
keeping rows that describe a file which is gone, and pressing **Refresh** says the same thing instead
of bringing the empty database back.

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
