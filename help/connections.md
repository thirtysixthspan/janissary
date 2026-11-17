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
- The connections tab is a table with Host, Tab, ID, Name, State, and Last activity columns. Rows are grouped by host, `Local` first, with open rows before closed ones and the most recent activity first within each grouping. A blank row of spacing separates open and closed connections when both are present, including in a docked list. A retained ACP record's Name is `acp:<role>:<tab name>` when it has role metadata, or the legacy `acp:<tab name>` when it does not; agent records use `agent:<tab name>`. A connection tab takes the same name. The record's own `ACP:` or `Agent:` title is in the row's tooltip. Lookup matches either one.
- If a retained record can't be saved or read, Janissary writes `warning: ACP record "<id>" <operation> failed: <reason>` to the app's stderr. `<operation>` is `read`, `scan`, `write`, or `delete`, and `<reason>` is the first line of the underlying error with its ending punctuation removed. The record stays available and the write is retried at the next save point.
- In the connections tab, a live SQLite row's Name is `sqlite:<name>` and its Tab column reads exactly `global`. Opening it focuses the first tab in strip order that has the database attributed, or does nothing when none does. Its close control closes the database app-wide.
- The shell id is the name of your shell program, taken from the `SHELL` environment variable. It is `bash` when that variable is not set.
- A closed ACP record can be deleted from the list after `Delete "<title>"?`. An agent record has no list control; its connection tab carries Terminate. The `system` tab's shell and terminal rows have no close control.
- A connection tab's **Focus tab** icon brings forward the tab the record began in, while that tab is still open. The request is refused with `The owning tab is no longer open.` once that tab has closed, and with `invalid focus payload` when it carries anything but a record id. Neither refusal focuses a tab or changes the record.
- In the center, the connections list header holds **Refresh** and **Split** at its right edge, where **Split** moves the list into the other pane. A docked list pairs **Refresh** with the dock-switch control and has no **Split**. Refresh rereads the current connections and redraws the list, leaving the selection where it was. It is refused with `invalid refresh payload` when sent with arguments, and with `refresh applies only to the connections list` when sent from a connection tab.
- Each row carries its owning tab, so two rows with the same kind and id stay distinct. A row action aimed at a row whose owner has since changed is refused and changes nothing, and a pending `Delete "<title>"?` confirmation is discarded when its row is replaced or removed.
- In a connection tab, thought entries start collapsed and tool entries start expanded; toggling one survives later streamed updates. An entry whose whole text is JSON reads as indented, multi-line JSON, and a web link in an answer opens as a page tab through the app without navigating the app window.
- A popup row with a durable record id still opens its record tab after the session, run, or calling tab has ended; only a missing or expired record is refused.
- With nothing open, `connections list` prints `No open connections.`
