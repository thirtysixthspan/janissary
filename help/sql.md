### sql

Open a database browser with table filtering, sorting, paging, editing, export, and a SQL console. Bare `sql` opens the database whose connection was opened most recently, or the first database by name when none is open.

**Usage**

`sql [<name>]`

`sql [<name>] left`

`sql [<name>] right`

**Use cases**

- Browse and edit tables in a SQLite database.
- Open the database opened most recently or select one by name.
- Dock the database browser beside another tab.
- Bring a docked database browser back to the center with bare `sql`.

**Examples**

- `sql` opens the database whose connection was opened most recently.
- `sql inventory` opens the database named `inventory`.
- `sql inventory right` docks that database browser on the right. `left` and `right` work in any capitalization.

**Notes**

- `sql` never creates a database. A name with no database prints `No database named "<name>". Create it with: db sqlite create <name>`, and bare `sql` with no databases prints `No databases. Create one with: db sqlite create <name>`.
- A name containing a character other than letters, digits, `-`, or `_` prints `Invalid database name "<name>".`
- Because `left` and `right` are read as dock words when they come last, a database named `left` or `right` cannot be opened by name.
