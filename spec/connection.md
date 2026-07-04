# Connection

The `connection` command inspects and closes the five kinds of long-lived connection the app holds. Each connection is addressed as `<kind>:<id>`.

### Kinds

| Kind | Id | Scope | Backing store |
|---|---|---|---|
| `sqlite` | database name | Global (shared across tabs) | connection registry in `connections.ts` |
| `shell` | shell program basename (`bash`, `zsh`, …) | Current tab | `shellsRef` (keyed by tab index) |
| `acp` | `opencode` | Current tab | `acpRef` (keyed by tab index) |
| `browser` | window id (`w1`, `w2`, …) | Current tab | `browserRef` (keyed by tab index) |
| `ssh` | tab label, or the destination as typed | Global (the ssh tab is its own scope — it has no command bar to run `connection` from) | the ssh tab's own `HarnessView.destination`/`ptyId` |

The shell id is derived from `process.env.SHELL` (default `bash`); the acp id is always `opencode` (the hardcoded agent); browser window ids are a per-tab counter; see SSH Tab for id resolution.

### `connection list`

Lists all open connections, one per line: the current tab's shell (`shell:<name>`) if a shell is running, the current tab's agent (`acp:opencode`) if connected, the current tab's browser windows (`browser:<id>`), every open ssh tab (`ssh:<destination>`, global like sqlite — an ssh tab has no command bar of its own to list from), and every open SQLite connection (`sqlite:<name>`). When none are open it returns `No open connections.`

### `connection close <kind>:<id>`

- `sqlite:<name>` — closes the database connection via `closeConnection(name)`. Returns `Closed connection sqlite:<name>.` or `No open connection sqlite:<name>.` if none was open. The connection reopens on the next `db` command.
- `shell:<name>` — if `<name>` matches this tab's shell, kills the tab's shell process and clears its busy indicator; the shell respawns (restoring its cwd) on the next shell command. A mismatched or absent shell reports a `No open connection …` message.
- `acp:<name>` — if `<name>` is `opencode`, kills the tab's ACP session and clears its status-popup info; it reconnects on the next `acp` prompt. Otherwise reports `No open connection …`.
- `browser:<id>` — closes that window in the current tab's browser (async; shown via a running entry). Returns `Closed connection browser:<id>.` or `No open connection browser:<id>.`. Closing the tab's last window ends that tab's browser process.
- `ssh:<id>` — kills the matching ssh tab's PTY (`<id>` matched against an ssh tab's label first, then its destination), which then closes the tab through the normal PTY-exit path. Returns `Closed connection ssh:<id>.` or `No open connection ssh:<id>.` if no ssh tab matches. See SSH Tab.

Pressing `Tab` at the target of `connection close` completes against the active tab's open connection strings (its shell, agent, and browser windows plus every open `sqlite:<name>` and `ssh:<label>`), so a connection can be closed by completing and running `connection close <string>`.

### Lifecycle integration

Closing a tab kills that tab's shell, ACP, and browser connections (SQLite connections, being global, are untouched). Quitting the app, closing the last tab, and the component-unmount cleanup all additionally close every tab's browser and call `closeAllConnections()` to close every open SQLite connection.

### Validation

A close target must be `<kind>:<id>` with a known kind (`sqlite`, `shell`, `acp`, `browser`) and a non-empty id; otherwise a descriptive error is returned. A bare `connection` or an unrecognized action returns the `Usage:` message.

### Connection window

A small titled `connections` panel (`ConnectionWindow`) floats at the top-right of the active tab, listing that tab's live connections on separate lines: the shell + working directory (`bash:~/dir`) once a shell is running, the ACP agent as `acp:<agent>` (e.g. `acp:opencode`) once connected, each browser window as `browser:<id> (<mode>)`, and `sqlite:<name>` for each database the tab has accessed. The window appears whenever any of these exist. Although SQLite connections are global, each is attributed to the tab(s) that ran a `db` command against it (tracked in `tabDbConns`), so a tab's window reflects the databases it has opened; the list is filtered against the live registry (`isConnectionOpen`), so closing a connection (`connection close sqlite:<name>` or `db sqlite delete`) removes it from the window.

Over an ssh tab, this panel shows only that tab's own `ssh:<destination>` row (no `terminal:` row — the ssh session is the tab's only PTY) and is shown even though the whole tab is a terminal, unlike other harness tabs where the panel is suppressed since the terminal already *is* the connection. See SSH Tab.

### `connection` command

`connection <list|close> [kind:id]` lists or closes open connections. See the Connections section. `connection list` shows every open connection; `connection close <kind>:<id>` closes one, where `<kind>` is `sqlite`, `shell`, `acp`, `browser`, or `ssh`. Malformed invocations return a `Usage:` message.
