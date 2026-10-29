### connection

List open connections or close one by its connection string.

**Usage**

`connection list`

`connection close <connection>`

**Use cases**

- See active SQLite, shell, ACP, browser, SSH, and terminal connections.
- Close a connection that is no longer needed.

**Examples**

- `connection list` lists open connections.
- `connection close shell:bash` closes the matching shell connection.

**Notes**

- Each connection is `<kind>:<id>`, and `<kind>` is `sqlite`, `shell`, `acp`, `browser`, `ssh`, or `terminal`. `connection list` prints exactly the names `connection close` accepts.
- The `shell` id is the name of your shell program, taken from the `SHELL` environment variable. It is `bash` when that variable is not set.
- A bare `connection`, or any action other than `list` or `close`, prints `Usage: connection <list|close> [kind:id]  (e.g. connection close sqlite:mydb)`. `connection close` with no target prints `Usage: connection close <kind>:<id>`.
- With nothing open, `connection list` prints `No open connections.`.
