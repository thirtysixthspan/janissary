# SQL database browser

A dockable tab that browses one of the project's SQLite databases: a metadata row naming the database
and the object, and a data grid with filtering, ordering, paging, cell editing, row insert and delete,
export, and a SQL console. Reached by the `sql` command. It is a bundled tab plugin like the other
file and list views, so everything about how it
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
with `db sqlite create <name>`, which is the only way to make one: the tab's switcher lists the
databases the registry has and refuses an unknown name the same way the command does. A name the
registry's rule refuses is refused here as it is there, with
`Invalid database name "<name>".`
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

The tab is one metadata row across the top and one body below it. The row is the shape a harness tab
has: the facts on the left, the actions at its right end, a border under the lot. Docked in a sidebar
— which is narrow — it is the same tab, narrower; there is nothing to switch between, so there is no
view switch.

The row carries a database dropdown and, beside it, a table dropdown, then the actions: **Insert
row**, **Columns**, the **CSV** and **JSON** exports, any finished exports as download links, and the
split control. **Insert row** is offered only for an object that can be written to.

The table dropdown lists every table, view, index, and trigger in the database, grouped in that order.
A trigger is listed but cannot be chosen. Choosing a different database reloads it, because the objects it lists are the new
database's.

Below the row, the grid's own header names the object on screen and reports how much of it is there.
Under it, a filter chip row lists the filters in force. Below the table, a pager steps a page at a
time, offers a page size, and re-reads on **Refresh**. The tab shows no SQL errors: a failure is a
notification attributed to the tab, described under the console below, and a read that failed leaves
the page it had on screen — `No rows.` included — rather than a message in its place. The table scrolls inside the tab rather than running into the command bar.

When the columns do not all fit across the tab, the values are cut off with an ellipsis so the table
fits rather than scrolling sideways. The widest values are cut first — a column whose values are all
short keeps its width — and a cut-off value is shown whole in its cell's tooltip. A column never
shrinks past its own name, so a table with more columns than the tab has room to name still scrolls
sideways. A table that fits is drawn with every value whole, the fit is worked out again when the tab
is resized or docked, and the cell being edited is never cut off.

Every read the tab makes is answered before the next one starts, so a tab that has just opened fills
in on its own: the table dropdown gains the database's objects and the grid its first page without
anything being asked of it twice, and a tab never rests in the state it was in before an answer. While
a read is still outstanding the grid header reads `Loading…`, and once the answer lands `No tables.`
means the database is empty rather than that nothing has been read yet.

### Filtering, ordering, and paging

A filter is a column, an operator, and a value, chosen under the header it applies to. The
operators are `contains`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `isNull`, and `notNull`; the last two
bind no value and hide the value field. Filtering the same column the same way again removes that
filter, so experimenting does not accumulate a list of them. Double-clicking a filter's chip switches
it off and on without retyping it: a switched-off filter stays in the chip row, drawn greyed out and
struck through, its tooltip reading **Enable** where a live one reads **Disable**, and the query
leaves it out, so the grid shows what the remaining filters say. It keeps its column, operator and
value while it is parked, so bringing it back is that one double-click. **Clear filters** removes
them all.

A filter belongs to a column of one object, so selecting a different object drops the filters naming
columns it does not have — keeping them would build a statement naming a column that is not there.
A filter on a column the new object does have stays, and an object the tab has never listed has no
known columns and so keeps everything. A parked filter is still a filter, so it is dropped with the
rest of that column's.

**Search every column** takes one term and matches it against the whole row, so a value can be found
without knowing which column holds it. It is the other order of narrowing — a per-column filter is
asked when the column is known, and this when it is not — so it sits above the per-column chips. Each
column contributes its own match and they are joined with `OR`, with every value rendered as text
first so a number and a string are searched alike, and a null column passing rather than hiding the
row. The term is its own group, so a row must match the term *and* every per-column filter. It names
no column, so it survives a switch to another object. Submitting an empty term removes it, and
**Clear filters** takes it away with the rest.

A **Columns** control in the metadata row lists the object's columns, each one toggling, with
**Show all** to take them all back. A wide table is otherwise only usable by horizontal scrolling, and
a dock or a split pane leaves little width to scroll within. Hiding a column does not change the
query: it is still selected and still filtered, so this is about which columns are on screen, not
which rows come back. The control says how many are hidden. Like a filter, a hidden column belongs to
one object, so selecting another object drops the ones it does not have.

A column header toggles the order: ascending, then descending, then none. With no order chosen the
grid orders by the object's primary key, or by its first column when it has none — a page needs a
total order, or paging skips and repeats rows. The order is a fact about a column of one object, as
a filter is, so selecting a different object drops an order naming a column it does not have and
the new object is ordered by its own key instead.

A column declared as a foreign key shows its value as a control rather than as text, titled with the
table and column it points at. Activating it selects that table filtered to the value, replacing any
existing filter on that column and leaving filters on other columns alone. The filter travels inside
the selection, not as a second action, because the grid's actions are answered against the state
before the last one landed. A composite key follows on its first target column alone, and offers
nothing to follow when the value is null, or when the referenced table's own key could not be
resolved to a single column — following an unresolved key would filter on nothing and look broken.
That is the whole of it: the key is followed one hop, into the row the value names, and no further,
because the grid is one object at a time.

Pages hold 50, 100 (the default), or 500 rows. The pager reads `Rows 1–100 of 4,213 rows`, or
`Rows 1–2 of 3 of 51,882 rows` once a filter is narrowing something — a filtered view that reported
only the filtered total would read as though the table were that small. The second figure counts the
object with no filters at all — and an **Search every column** term narrows a query as much as a
per-column filter does — so it is right even when the first query for an object arrives
already filtered, as following a key into an unvisited table does. The second figure is the object's
size as of the last read, and it is re-counted by a write and by **Refresh**, so it never reports an
object smaller than the one the first figure is counting. Changing the page size
returns to the first page. **Refresh** re-reads the schema and the current query.

Every value a filter, an order, or a write supplies is bound to the statement rather than
concatenated into it, and every object and column name comes from the database's own schema. A
filter value is compared as text, except in a comparison operator, where a value that parses as a
number binds as a number and one that does not binds as text. `contains` matches with `LIKE` and
escapes any `%` or `_` the value itself contains.

### Editing

Double-clicking a cell opens an editor; Enter commits it and Escape leaves it without changing
anything. The rows answer the keyboard while the rows have the focus: the highlighted row starts on
the first row of whatever page arrives, `ArrowUp` and `ArrowDown` move it a row at a time and stop at
the ends rather than wrapping, `Home` and `End` reach the first and last row of the page, and `Escape`
leaves the grid with nothing highlighted. The page scrolls to follow the highlighted row, and it counts
the column header — which stays put while the rows scroll under it — as out of sight, so a row is
brought out from under the header rather than left behind it. Reaching the first row again scrolls the
frame all the way back to the top of the table. The left and
right arrows are not the grid's — a run of rows has no column to move along — so they are left to the
application, which scrolls the frame the way it otherwise would. The highlight is back on the first
row after a new query, so it never sits on a row that now holds other values.

A keypress belongs to whichever of the two panes has the focus, and to no other: the copy key with
the command bar focused copies what is selected in the command bar, and `ArrowUp` in it recalls a
statement rather than moving the highlighted row. A cell holds either text
or null, and they are drawn differently: a null reads `NULL` in a muted style rather than as a blank
cell, so an empty string and a null are never confused. The editor has a **NULL** toggle, so writing a
null and writing the four characters `NULL` are two different acts. The toggle is part of the value
being edited rather than a write of its own — it takes effect when the editor commits, the same way
the typed text does, and leaving it with Escape changes nothing.

A write addresses one row by an identity the server issued when it returned the page. A client cannot
name a row it was not handed, cannot write its own `WHERE`, and a write naming a row whose page has
been superseded is refused with `That row is no longer loaded. Refresh and try again.` rather than
reaching a different row.

**Insert row** opens a form with one input per column, the statement the save will run shown above the
controls, and a Save and a Cancel. Nothing is written until Save, and a column the user leaves alone
is not named by that statement at all — so the table's own `DEFAULT` runs for it, which is what a
column nobody filled in is asking for. A `NOT NULL` column with no default and nothing typed into it
is the one that gets refused, by the database, naming the column. The primary key is the one column
that starts as an explicit null, since a key nobody chose is the one value a new row always has.
Each input carries a **NULL** toggle matching the cell editor's, and it is off until the user turns it
on — a blank field and an explicit null are different values, so the distinction is a control rather
than a convention about typing nothing, and turning the toggle off leaves the column unnamed again. A
field whose column is null is disabled, so a typed value cannot silently contradict the toggle beside
it. **Delete row** is on every row and asks first, through the application's own confirmation, naming
the table. It sits in the table's first column, ahead of the row header, so it is in the same place on
every table and on screen without scrolling across a wide one.
A run of highlighted rows is copied as tab-separated text, one line per row, by the platform's own
copy key.
A spreadsheet pastes it as a table with no quoting rules to disagree
about, so a value holding a comma cannot change the shape of what lands. A null copies as the `NULL`
the grid shows rather than as an empty cell the paste would turn back into a string, and a run that
runs off the end of the page copies only what was on screen. A text selection the browser has made
inside a cell is left alone, so copy still gets the
word. If the system clipboard is unavailable, the text is shown in a band above the table, with a
**Dismiss** control, rather than being dropped. That band is the text the user asked to copy, not a SQL
error.

The grid highlights whole rows and never individual cells, because a row is the unit everything here
acts on: a write names a row and a column because the statement needs both, and nothing in the tab
acts on a cell alone. One press anywhere in a row highlights that whole row, and a second press on a
cell is what opens its editor — so reading down a table does not open an editor on every row it
passes. The narrow header in front of each row highlights a row the same way, and carries no text
because the pager already says which rows the page holds. A shift-click extends the run to the row it
is held over, and the run reaches the same rows whether it was taken downwards or upwards. The
keyboard does the same with `Shift` held: `Shift+ArrowDown` and `Shift+ArrowUp` move the run's edge a
row at a time, and `Shift+Home` and `Shift+End` take it to the first and last row of the page — the
file navigator's own rules, so the two feel the same, and it moves its own highlight and scrolls to
follow it the same way. A whole row copies as one tab-separated line, which is what a row pastes as.


A **view** is always read-only, and so is a **table with no primary key**: there is no statement
that can address one row of it rather than several, and `rowid` is not a safe answer because a
`VACUUM` reassigns it and a `WITHOUT ROWID` table has none. Such a table's header reads `Read-only:
"<name>" is a view.` or `Read-only: "<name>" has no primary key.` and offers no edit, insert, or
delete control at all. Its grid is otherwise ordinary, and the console still writes to it.

A **statement's result** is read-only for the same reason: a statement the user typed is not
necessarily about one object, so there is no row in it for a write to name. Its header reads
`Read-only: this is a statement's result, not a table.`, it offers no edit, insert, or delete control
at all, and pressing a cell does nothing rather than writing. It can still be filtered, ordered,
paged, copied, and exported like any other, and the console still writes to the database.

### Statement history

The command bar is the only way to inspect what this tab has run. `ArrowUp` walks back through the
last fifty statements typed in it, `ArrowDown` walks forward again, and a statement is put in the
line rather than run on the spot, so it is always something the user can read and change before they
send it. There is no second list of the tab's statements anywhere in the tab, and no control that
empties one. What a statement produced is in the notifications feed, and the tab keeps nothing of
its own.

A statement the grid's own query issued is not in that walk, because the user did not type it. The
command bar is the only place SQL is entered, which is what makes one answer to "run this" enough.

### Export

Exporting writes the whole filtered, ordered query — not one page — as CSV or JSON, to
`.janissary/db/exports/<database>-<object>-<n>.<ext>`, and the tab offers it as a download. A
`CSV` and a `JSON` control in the metadata row start one, and the file appears in the
tab's own list of exports as a link. Both are unavailable while the tab is waiting on something else,
because it takes one request at a time. A second export of the same object gets the next number
rather than overwriting the first. A CSV field containing a comma, a quote, or a line break is
quoted, and an interior quote is doubled.

An export reads rather than writes, so a view — or a table with no primary key, which the grid will
not edit — can still be exported.

An object whose name is not usable in a filename — anything holding a path separator, and a name left
with nothing a file could carry — is exported under a reduced name, and one left with nothing at all
is refused with `Cannot export "<name>": its name has no characters a file can carry.` The file
always lands inside the export directory, whatever the object is called.

An export over 1,000,000 rows is refused with `Export too large: <n> rows (limit 1,000,000). Add a
filter and try again.` rather than blocking the whole application while it is written.

### Statistics

There is no statistics panel. A per-column distribution of the selected object is a question the
command bar answers with a statement, and a control that asks the database for one is one more thing
between the user and the rows.

### The console

The tab's bottom line is the application's own command bar, so it looks and behaves like every other
line of text in the application, and Shift+Enter starts a new line. Its prompt reads `SQL >` rather
than a bare `>`, because a chevron on its own in a tab full of grids reads as the application's own
command line and this one is not that. It is the only place SQL is entered: there is no second control
for it anywhere in the tab.

Enter sends what is typed, and the host decides whether that was a read or a write by the same test
`db sqlite query` uses: a statement that returns rows fills the grid, and anything else is a write
whose outcome is reported as a notification, as described below. Nothing is written under the prompt.
Arrow keys walk back through the last fifty statements typed in this tab.

The console's keys are the agent command bar's, and they are the console's own while it has the focus:
the left and right arrows move the caret along the line, the up and down arrows walk the fifty
statements back and forward again, `Enter` sends, and `Shift+Enter` starts a new line. Nothing pressed
here reaches the rows above — an up arrow recalls a statement and does not also move the highlighted
row.

`Tab` moves focus from the command bar to the rows, and `Tab` again brings it back to the command bar.
The tab is two panes and this is how a user crosses between them; `Shift+Tab` is left to the
application, which walks out of a plugin tab. Unlike the agent command bar, `Tab` here does not
complete a word: there is nothing in this tab for a word to be completed against.

A statement's result is a **notification**, and the tab says nothing about it. The line under the
prompt was the first thing anything else typed replaces and the first thing lost when the user looks
at another tab, so a result the user asked for belongs where it outlasts the tab.

A statement that changed rows reports `OK.` or the number of rows it changed, which is always short
enough to say outright. A statement that returned rows reports its result: the column names, one
tab-separated line per row, and the number of rows the statement returned. A result of more than
forty lines is shortened to the first forty, with the real count beside it, and the notification
carries a link to a file holding every row — the same arrangement an auto-approved permission
prompt's screen capture uses. That file is written to
`.janissary/db/exports/<database>-result-<timestamp>.txt` and is named for when the statement ran, so
a link on an older notification keeps opening the result that notification is about. A result of more
than a million rows is written out to that million and the notification says so, because a capped file
read as a complete one would be worse than a query too large to export. See [[notifications]] for the
feed.

A statement that fails is the same kind of notification, and it says the SQLite error. A failure is
the one result a user did not ask for and cannot predict. It is attributed to the tab the statement
was run from, and it is said once per failure: an answer that arrives twice for one request says it
once, and a failure that has gone away and come back says it again. The notification is the only place
it is said: the tab shows no SQL error of its own, whether the failure was a statement typed here, a
page the grid asked for, a write, or an export. A failed statement leaves the grid as it was, and is
not also reported as a count.

The tab keeps no record of the statements it has run. What ran is in the notifications feed, and the
command bar's own `ArrowUp` walk is the way back to what was typed.

A statement that succeeds reports its outcome, and the tab then
reads itself again: the object list, then the page it was showing. That is the same reading **Refresh**
does, and it is what makes a `CREATE`, an `ALTER` or a `DROP` typed into the command bar show up
without a second press — the console is the only way to change a schema, so the schema changes there.
It is also how a table a `CREATE` made becomes the tab's page: there is nothing on screen to re-read
before the statement, and the object list is what picks one.

A statement that failed changes nothing the tab can show, so it asks for no re-read at all. A statement
that returns rows only fills the grid, since a read cannot have changed anything.

A read fills the grid with the first two hundred rows it returns. A result longer than that is cut
off there and the range line says so rather than reporting a table of two hundred, because a query
the console refused to finish is not the same thing as a small one. The grid and the notification are
two different shortenings of one result — two hundred rows in a table, forty lines in a feed — and
neither is the whole of it unless the range line says so. What the grid fills with is
read-only, as described under Editing: a statement is not a page of one object, so nothing in it can
be written to.

Nothing a grid or a console does disables the plugin, and nothing is written to a transcript.

A database deleted by `db sqlite delete` while its tab is open is not an ordinary read failure. The
tab drops the grid, and the grid's header — where the range line would be — reads
`Database "<name>" does not exist. Create it to start.` rather than keeping rows that describe a file
which is gone. That is the one failure the tab itself states, because with no page left the header
would otherwise read `Loading…` for good. Pressing **Refresh** says the same thing instead of bringing
the empty database back.

### What it does not do

- It browses only the project's own databases, by name. A `.sqlite` file anywhere else on disk is
  not reachable, because the registry derives every path from a validated name.
- It does not make a database. Its switcher offers the ones the registry has and refuses an unknown
  name, because reading a schema opens a connection and that would create the file behind a name
  that is more likely a typo than a wish. `db sqlite create <name>` is the way to make one, and
  `db sqlite delete` is the way to remove one.
- It does not change a schema from the grid. The console is the way to run `CREATE`, `ALTER`, or
  `DROP`, exactly as `db sqlite query` already is.
- It does not show the statement behind the grid, and offers no way to run one the user did not type.
  The console is the only place SQL is entered.
- It does not join tables or build a query. The grid is one object at a time.
- It does not report statistics. A per-column distribution is a statement in the command bar.
- It has no copy control. The highlighted rows are copied by the application's own copy key.
- It does not watch other tabs. A `db` command run elsewhere that changes the data leaves this view
  showing what it last read, which is what **Refresh** is for.
- It does not undo. A cell edit commits or it does not.
- It adds no `sqlite:` row to the tab's own connections panel: a plugin tab runs no `db` command, so
  the tab is not credited with the connection. The connection is global, so the database appears in
  `connection list` and in tab-completion app-wide, and `connection close sqlite:<name>` closes it.
