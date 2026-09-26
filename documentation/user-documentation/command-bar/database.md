# Databases

<img class="agent-float" src="/agents/ekrem-south-west.png" alt="" />

The `db` command creates, queries, lists, and deletes SQLite databases that persist across sessions, so a tab (or its agent) can store and query structured data without any external service:

```
db sqlite create notes
db sqlite query notes CREATE TABLE items (id INTEGER PRIMARY KEY, text TEXT)
```

`sqlite` is the only supported engine, and it is the first word after `db`. Any other engine name is rejected with `Unsupported engine "<name>". Only "sqlite" is supported.`

You can type an unprefixed SQL statement when this tab has an open database. If exactly one database
is open and the statement is recognized confidently, it runs there. With no database or several
databases open, the route chooser lets you pick the destination. To skip the chooser, name the engine
and the database yourself: `db sqlite query notes SELECT * FROM items`. The word after `db` is always
read as the engine name, so `db SELECT * FROM items` is rejected with
`Unsupported engine "select". Only "sqlite" is supported.`

![A db sqlite create command followed by a db sqlite query command in the transcript, with the query's result table printed below it.](/screenshots/db-output.png)

## Subcommands

| Subcommand | What it does |
|---|---|
| `db sqlite create <name>` | Create an empty database (reports if it already exists) |
| `db sqlite delete <name>` | Delete the database file (reports if it doesn't exist) |
| `db sqlite query <name> <sql>` | Run SQL against the database |
| `db sqlite list` | List existing database names, one per line, or `No databases.` when the project has none |

A bare `db` prints a `Usage:` line.

## Naming databases

A database name must match `^[A-Za-z0-9_-]+$` — letters, numbers, `-`, and `_` only. This also blocks path traversal, since a name can never contain `/` or `..`. An invalid name reports `Invalid database name "<name>". Use letters, numbers, "-" and "_" only.`

## Running queries

<img class="agent-float left" src="/agents/hamza-south-east.png" alt="" />

`db sqlite query <name> <sql>` runs the SQL verbatim on the database:

- **Row-returning statements**, meaning those starting with `SELECT`, `PRAGMA`, `WITH`, or `EXPLAIN` (case-insensitive), print an aligned table: a header row, a dashed separator, one row per record, and a trailing `(<n> row(s))` count. No matching rows prints `(0 rows)`.
- **Every other statement**, like `CREATE TABLE`, `INSERT`, or `UPDATE`, runs and reports `OK.` on success. Multiple semicolon-separated statements are allowed.
- A bad statement or a missing table reports `Query error: <message>` without crashing the tab.
- Querying a database that doesn't exist reports `Database "<name>" does not exist. Create it with: db sqlite create <name>`, and deleting one reports `Database "<name>" does not exist.`

## Connections are global and persistent

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

The first command that touches a database opens a connection that stays open, shared across every tab and not just the one that opened it, until you close it, delete the database, or quit the app. Creating a database counts as touching it: `db sqlite create notes` opens a connection for `notes`, creating the file on the way, so the database appears in `connection list` straight away. Because the connection is reused, connection-scoped state like open transactions and `TEMP` tables survives between commands. See [Connections](/user-documentation/command-bar/connections) for listing and closing connections, including `connection close sqlite:<name>`.

## Databases persist across sessions

Database files live in `.janissary/db/sqlite/<name>.sqlite` and are never cleared — not on a normal launch, not on `--relaunch`, not on quit. Unlike a tab's workspace or session state, a database you create sticks around until you `db sqlite delete` it.
