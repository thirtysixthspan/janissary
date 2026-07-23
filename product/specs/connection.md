# Connection

The `connection` command inspects and closes the five kinds of long-lived connection the app holds. Each connection is addressed as `<kind>:<id>`.

### Kinds

| Kind | Id | Scope | Backing store |
|---|---|---|---|
| `sqlite` | database name | Global (shared across tabs) | connection registry in `connections.ts` |
| `shell` | shell program basename (`bash`, `zsh`, …) | Current tab | `shellsRef` (keyed by tab index) |
| `acp` | `opencode` (interactive tab), or a persona name (editor tab) | Current tab | `acpRef` (keyed by tab index); an editor tab's persona connections are kept separately, one per persona |
| `browser` | window id (`w1`, `w2`, …) | Current tab | `browserRef` (keyed by tab index) |
| `ssh` | tab label, or the destination as typed | Global (the ssh tab is its own scope — it has no command bar to run `connection` from) | the ssh tab's own `HarnessView.destination`/`ptyId` |

The shell id is derived from `process.env.SHELL` (default `bash`); the acp id is `opencode` (the hardcoded agent) for a normal tab's interactive connection, or the persona's name for one of an editor tab's persona connections (see [[editor-tab]] "In-editor persona suggestions"); browser window ids are a per-tab counter; see SSH Tab for id resolution.

### `connection list`

Lists all open connections, one per line: the current tab's shell (`shell:<name>`) if a shell is running, the current tab's agent (`acp:opencode`) if connected, the current tab's browser windows (`browser:<id>`), every open ssh tab (`ssh:<destination>`, global like sqlite — an ssh tab has no command bar of its own to list from), and every open SQLite connection (`sqlite:<name>`). When none are open it returns `No open connections.`

### `connection close <kind>:<id>`

- `sqlite:<name>` — closes the database connection via `closeConnection(name)`. Returns `Closed connection sqlite:<name>.` or `No open connection sqlite:<name>.` if none was open. The connection reopens on the next `db` command.
- `shell:<name>` — if `<name>` matches this tab's shell, kills the tab's shell process and clears its busy indicator; the shell respawns (restoring its cwd) on the next shell command. A mismatched or absent shell reports a `No open connection …` message.
- `acp:<name>` — on an editor tab, if `<name>` matches one of that tab's open persona connections, closes just that connection; a later request to that persona in the same tab opens a fresh one. Otherwise, if `<name>` is `opencode`, kills the tab's interactive ACP session and clears its status-popup info; it reconnects on the next `acp` prompt. If neither matches, reports `No open connection …`.
- `browser:<id>` — closes that window in the current tab's browser (async; shown via a running entry). Returns `Closed connection browser:<id>.` or `No open connection browser:<id>.`. Closing the tab's last window ends that tab's browser process.
- `ssh:<id>` — kills the matching ssh tab's PTY (`<id>` matched against an ssh tab's label first, then its destination), which then closes the tab through the normal PTY-exit path. Returns `Closed connection ssh:<id>.` or `No open connection ssh:<id>.` if no ssh tab matches. See SSH Tab.

Pressing `Tab` at the target of `connection close` completes against the active tab's open connection strings (its shell, agent, and browser windows plus every open `sqlite:<name>` and `ssh:<label>`), so a connection can be closed by completing and running `connection close <string>`.

### Lifecycle integration

Closing a tab kills that tab's shell, ACP, and browser connections — and, for an editor tab, every one of its open persona connections — (SQLite connections, being global, are untouched). Quitting the app, closing the last tab, and the component-unmount cleanup all additionally close every tab's browser and call `closeAllConnections()` to close every open SQLite connection.

### Validation

A close target must be `<kind>:<id>` with a known kind (`sqlite`, `shell`, `acp`, `browser`) and a non-empty id; otherwise a descriptive error is returned. A bare `connection` or an unrecognized action returns the `Usage:` message.

### Connection window

A small titled `connections` panel (`ConnectionWindow`) floats at the top-right of the active tab, listing that tab's live connections on separate lines: the shell + working directory (`bash:~/dir`) once a shell is running, the ACP agent as `acp:<agent>` (e.g. `acp:opencode`) once connected, each browser window as `browser:<id> (<mode>)`, and `sqlite:<name>` for each database the tab has accessed. The window appears whenever any of these exist. Although SQLite connections are global, each is attributed to the tab(s) that ran a `db` command against it (tracked in `tabDbConns`), so a tab's window reflects the databases it has opened; the list is filtered against the live registry (`isConnectionOpen`), so closing a connection (`connection close sqlite:<name>` or `db sqlite delete`) removes it from the window.

Over an ssh tab, this panel shows only that tab's own `ssh:<destination>` row (no `terminal:` row — the ssh session is the tab's only PTY) and is shown even though the whole tab is a terminal, unlike other harness tabs where the panel is suppressed since the terminal already *is* the connection. See SSH Tab.

In the web app, the tab's metadata bar carries a connections button (a plug icon) alongside its other buttons. When the tab has at least one live connection, the button is active: hovering it shows the connections window, moving away hides it again, and clicking pins the window open until the button is clicked a second time. When the tab has no live connections, the button is dark and unclickable, with a tooltip explaining there are none. Each time a tab becomes the active tab, its connections window (if non-empty) auto-shows immediately and then fades away after five seconds; moving the pointer onto the button or the window during that auto-show cancels the fade and hands control back to plain hover behavior, while clicking at any point pins or unpins the window regardless of where it is in that sequence. A non-ssh harness tab has no connections button, since the terminal is already the connection; an ssh harness tab keeps both the connections and schedule buttons.

An editor tab carries the same connections button and window, listing its open persona connections (each shown as `<persona> (acp)`) alongside any other connections that tab has opened. Unlike every other kind of connection row, an editor tab's persona connection rows carry their own small close control; clicking it closes just that one persona's connection immediately, the same as running `connection close acp:<persona>`, without affecting any other open persona connection in that tab.

### Transcript button on ACP connection rows

Every ACP connection row in the connections window — the tab's own agent (`acp:opencode`), a monitor session (`monitor:<persona>`), or an editor tab's persona connection (`<persona> (acp)`) — carries a small clipboard-icon button, alongside any close control the row already has. Clicking it opens that session's transcript as a point-in-time, read-only snapshot in a scrollable editor tab: the tab's own agent shows its full tab transcript, a monitor row shows its accumulated exchange tagged into "sent to model" and "model response" blocks, and an editor-persona row shows that persona's own accumulated exchange the same way. The snapshot reflects the exchange at the moment of the click — clicking the button again opens a fresh snapshot rather than updating the first one. A session that has not yet exchanged anything still opens a tab, reading `No transcript yet.`, so every click gives visible feedback.

### `connection` command

`connection <list|close> [kind:id]` lists or closes open connections. See the Connections section. `connection list` shows every open connection; `connection close <kind>:<id>` closes one, where `<kind>` is `sqlite`, `shell`, `acp`, `browser`, or `ssh`. Malformed invocations return a `Usage:` message.
