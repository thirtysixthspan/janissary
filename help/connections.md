### connections

Open the app-wide connections tab, list or close live connections, or open a live connection or retained ACP/agent session. `connection` is the singular alias.

**Usage**

`connections`

`connections list`

`connections close <connection>`

`connections <text>`

`connections left`

`connections right`

**Use cases**

- See and manage the app-wide list of live connections and retained sessions.
- Close one live SQLite, shell, role-specific ACP, browser, SSH, or terminal connection.
- Open a retained ACP or agent session by its UUID or complete title.
- Dock the connections list into a sidebar.

**Examples**

- `connections` opens or focuses the connections tab.
- `connections list` lists open connections.
- `connections close shell:bash` closes the matching shell connection.
- `connections close acp:tell:claude-haiku-4-5` closes only that tell session.
- `connections acp:ask:opencode-go/deepseek-v4.1-flash` opens the invoking shell's ask session when it matches.
- `connections acp:tell:claude-haiku-4-5` opens the invoking shell's tell session when it matches.
- `connections ACP: explain this test` opens the retained ACP session whose complete title matches.
- `connection ACP: explain this test` opens the same record through the singular alias.
- `connections acp: explain this test` matches the same title ignoring letter case.
- `connections acp:shell-1` opens the newest record listed under that name, unless the invoking tab's own session or a live `acp:shell-1` connection matches first.
- `connections left` docks the list in the left sidebar; running bare `connections` again returns it to the centre.

**Notes**

- `connection` runs the same command, including bare, `list`, `close`, and `<text>` forms. Only `connections left` and `connections right` dock; `connection left` and `connection right` are lookup text.
- Lookup tries the text first as a retained record's exact UUID, then the invoking tab's own role-qualified `acp:<role>:<provider/model>` session, then a live `<kind>:<id>` connection by focusing its owning tab, then a retained record's complete title, and finally a retained record's list name, such as `acp:<role>:<tab name>`, choosing the most recently updated match at each step. A legacy `acp:<model>` lookup selects ask, and a role-less retained record keeps its old `acp:<tab name>` name.
- Title matching ignores letter case but compares the whole title, including its generated `ACP:` or `Agent:` prefix and every interior space. It is not a prefix, substring, fuzzy, or whitespace-normalized match. Quotation marks are ordinary text, not syntax. A real multiword title is written without them, such as `connections ACP: explain this test`.
- A failed lookup reports exactly `No connection matching "<text>".`
- Each live connection is `<kind>:<id>`, and `<kind>` is `sqlite`, `shell`, `acp`, `browser`, `ssh`, or `terminal`. Core ACP names include their role, for example `acp:ask:<provider/model>` and `acp:tell:<provider/model>`. `connections list` prints exactly the names `connections close` accepts.
- `connections close` with no target prints `Usage: connections close <kind>:<id>`. A malformed target reports `Invalid connection "<text>". Expected <kind>:<id>, e.g. sqlite:mydb.`, `Unknown connection kind "<kind>". Expected one of: sqlite, shell, acp, browser, ssh, terminal.`, or `Missing id in "<text>".`
- `connections close` reports its result as a notification: `Closed connection <kind>:<id>.` when it closes the connection, and an error notification reading `No open connection <kind>:<id>.` when nothing matches, or `Could not close connection <kind>:<id>: <reason>.` when closing it fails. `acp:tell` and `acp:tell:<model>` select tell; `acp:ask`, `acp:ask:<model>`, and legacy or unmatched ACP ids select ask.
- Only `connections close` completes its target against open connection strings. Singular `connection close` accepts the same targets but offers no completion.
- The connections tab is a table with Host, Tab, ID, Name, State, and Last activity columns. Rows are grouped by host, `Local` first, with open rows before closed ones and the most recent activity first within each grouping. A retained ACP record's Name is `acp:<role>:<tab name>` when it has role metadata, or the legacy `acp:<tab name>` when it does not; agent records use `agent:<tab name>`. A connection tab takes the same name. The record's own `ACP:` or `Agent:` title is in the row's tooltip. Lookup matches either one.
- In the connections tab, a live SQLite row's Name is `sqlite:<name>` and its Tab column reads exactly `global`. Opening it focuses the first tab in strip order that has the database attributed, or does nothing when none does. Its close control closes the database app-wide.
- The shell id is the name of your shell program, taken from the `SHELL` environment variable. It is `bash` when that variable is not set.
- A closed ACP record can be deleted from the list after `Delete "<title>"?`. An agent record has no list control; its connection tab carries Terminate. The `system` tab's shell and terminal rows have no close control.
- A connection tab's **Focus tab** icon brings forward the tab the record began in, while that tab is still open.
- With nothing open, `connections list` prints `No open connections.`
