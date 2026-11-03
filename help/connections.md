### connections

List open connections or close one by its connection string.

**Usage**

`connections list`

`connections close <connection>`

**Use cases**

- See active SQLite, shell, ACP, browser, SSH, and terminal connections.
- Close a connection that is no longer needed.

**Examples**

- `connections list` lists open connections.
- `connections close shell:bash` closes the matching shell connection.

**Notes**

- Each connection is `<kind>:<id>`, and `<kind>` is `sqlite`, `shell`, `acp`, `browser`, `ssh`, or `terminal`. `connections list` prints exactly the names `connections close` accepts.
- `connections list` prints its lines in a shell tab too.
- `connections close` reports its result as a notification: `Closed connection <kind>:<id>.` when it closes the connection, and an error notification reading `No open connection <kind>:<id>.` when nothing matches, or `Could not close connection <kind>:<id>: <reason>.` when closing it fails.
- The `shell` id is the name of your shell program, taken from the `SHELL` environment variable. It is `bash` when that variable is not set.
- A bare `connections`, or any action other than `list` or `close`, prints `Usage: connections <list|close> [kind:id]  (e.g. connections close sqlite:mydb)`. `connections close` with no target prints `Usage: connections close <kind>:<id>`.
- With nothing open, `connections list` prints `No open connections.`.
