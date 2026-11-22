### sql

Open a database browser with table filtering, sorting, paging, editing, export, and a SQL console. `sql file <path>` browses a SQLite file at a filesystem path, `sql database <name>` opens a registry database by name, and bare `sql` reopens the database whose connection was opened most recently, or the first by name when none is open. No form docks.

**Usage**

`sql file <path>`

`sql database <name>`

`sql`

**Use cases**

- Browse and edit a SQLite database that already exists on disk, without copying it into the project's database directory.
- Browse and edit one of the project's named databases.
- Reopen the database opened most recently.

**Examples**

- `sql file /data/reports/quarterly.sqlite` opens the SQL browser on that file in the centre, titled `quarterly`.
- `sql file fixtures/sales 2024.sqlite` opens the file at that relative path; the value is taken verbatim, so interior spaces survive.
- `sql database inventory` opens the database named `inventory`.
- `sql` opens the database whose connection was opened most recently.

**Notes**

- Keywords are lower case only and must be followed by whitespace; the value is the trimmed remainder taken verbatim. There is no trailing dock-word special case: `sql file <path> left` treats ` left` as part of the path.
- A relative `sql file` path resolves against the application's project/launch directory; an absolute path is used unchanged.
- An unrecognized argument — an old bare name such as `sql inventory`, a removed dock word such as `sql left`, a keyword with no separating whitespace such as `sql file/path`, or a keyword with no value — prints `Usage: sql [file <path>|database <name>]`.
- `sql file` never creates a database. A missing path prints `No database file at "<path>".` with the resolved absolute path and opens no tab.
- `sql database` never creates a database. A name with no database prints `No database named "<name>". Create it with: db sqlite create <name>`, and bare `sql` with no databases prints `No databases. Create one with: db sqlite create <name>`.
- A name containing a character other than letters, digits, `-`, or `_` prints `Invalid database name "<name>".`
- A path-backed tab shows a read-only basename label with the full path in its tooltip instead of the database dropdown, stays out of `connections list` and tab completion, and cannot be closed with `connections close sqlite:<name>`.
