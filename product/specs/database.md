# Databases

SQLite database management via the `db` command, backed by Node's built-in `node:sqlite` module (no external dependency). The underlying connection registry lives in `src/connections.ts` and is shared with the `connection` command (see the Connections section).

### Storage location

Each database is a single file at `.janissary/db/sqlite/<name>.sqlite`. The directory is created on demand. The path base is set at startup via `initDbDir(process.cwd())`.

### Persistence

Unlike `.janissary/state/` and `.janissary/workspace/`, the database directory is **never cleared** — not on normal launch, not on `--relaunch`, not on quit. Databases persist across sessions by design.

### Connection model

Connections are persistent, not per-command. The first `db` command targeting a database opens a `DatabaseSync` connection that is cached in a module-level `Map` keyed by database name and kept open across subsequent commands and tabs. Connections are global (a database is a shared resource, not tab-scoped) and several may be open at once. A connection is closed only by `connection close sqlite:<name>`, by `db delete` (which closes before removing the file), or at app exit (`closeAllConnections`). Because the connection is reused, connection-scoped state — transactions, `TEMP` tables, pragmas — survives between commands. `db create` opens (and lazily creates the file for) a connection; `db query` reuses or opens one; `db delete` closes any open connection first so the file is not locked.

### Name validation

Database names must match `^[A-Za-z0-9_-]+$`. This restricts names to safe filename characters and blocks path traversal (`..`, `/`). Invalid names return `Invalid database name "<name>". …`.

### Engine

Only `sqlite` is accepted as the engine token. Any other engine returns `Unsupported engine "<engine>". Only "sqlite" is supported.`

### Query handling

`db sqlite query <name> <sql>` runs the SQL verbatim (whitespace within the SQL is preserved) on the database's persistent connection:

- **Row-returning statements** — those beginning with `SELECT`, `PRAGMA`, `WITH`, or `EXPLAIN` (case-insensitive) — are executed with a prepared statement and rendered as an aligned text table: a header row, a dashed separator, one row per record, and a trailing `(<n> row[s])` count. A result with no rows renders `(0 rows)`.
- **Other statements** are executed with `exec`, which supports multiple semicolon-separated statements, and report `OK.` on success.
- Errors (bad SQL, missing tables) are caught and returned as `Query error: <message>` without crashing the app.
- Querying or deleting a database that does not exist reports a friendly message rather than failing.

### Experimental-warning suppression

`node:sqlite` emits a one-time `ExperimentalWarning` on first use. Because the app runs in Ink's alternate-screen mode, a stray stderr write would corrupt the display, so a `process.on('warning', …)` listener is registered at startup to swallow that warning (registering any listener also disables Node's default stderr printer).

### `db` and `database` commands

`db sqlite <create|delete|query|list> [name] [sql]` manages SQLite databases (the engine — `sqlite` — is the first parameter). See the Databases section for details. Subcommands:

- `db sqlite create <name>` — create an empty database (reports if it already exists).
- `db sqlite delete <name>` — delete the database file (reports if it does not exist).
- `db sqlite query <name> <sql>` — run SQL; row-returning statements print a table, others report `OK.`.
- `db sqlite list` — list existing database names.

Only the `sqlite` engine is supported; any other engine name is rejected. Database names are validated against `^[A-Za-z0-9_-]+$` (preventing path traversal). Malformed invocations return a `Usage:` message.

### Browsing a database

The command surface above is the only way to *run* SQL, not the only way to *see* a database. The `sql` command opens a dockable tab that browses one: an object list beside a data grid, with filtering, ordering, paging, cell editing, row insert and delete, export, following a foreign key into the row it names, a statement history, and a SQL console. It uses this same registry, the same name rule, and the same read/write statement split, and it claims no file extensions — a database is reachable only by the name the registry holds it under. See [[sql-database]].

Neither surface replaces the other. `db sqlite query` still prints the same aligned text table into a transcript, which is what an agent's tool loop and a scripted workflow want; the browser is what a person wants when they do not yet know what to query.
