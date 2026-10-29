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
