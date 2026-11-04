# Connection

The `connections` and `connection` commands open the connections tab, inspect and close the six kinds of long-lived connection the app holds, and open a live connection's owning tab or a retained record by title. Each live connection is addressed as `<kind>:<id>`.

### Kinds

| Kind | Id | Scope | Backing store |
|---|---|---|---|
| `sqlite` | database name | Global (shared across tabs) | connection registry in `connections.ts` |
| `shell` | shell program basename (`bash`, `zsh`, …) | Current tab | `ShellManager` |
| `acp` | a supported plugin tab's core ACP connection name (`provider/model`), a monitor's name, or a persona name (editor tab) | Current tab | `AcpManager`; a tab's monitors are kept by `MonitorManager`, and an editor tab's persona connections separately, one per persona |
| `browser` | window id (`w1`, `w2`, …) | Current tab | `BrowserManager` |
| `ssh` | tab label, or the destination as typed | Global (the ssh tab is its own scope — it has no command bar to run `connections` from) | the ssh tab's own `HarnessView.destination`/`ptyId`, or a remote tab's channel |
| `terminal` | the program a tab's terminal runs (`vim`, `claude`, …) | Current tab | `PseudoterminalManager` |

The shell id is derived from `process.env.SHELL` (default `bash`); the acp id is the session's `provider/model` name (the same name the connections panel shows) for a tab's own agent session, a monitor's runtime name for a monitor started from the tab, or the persona's name for one of an editor tab's persona connections (see [[editor-tab]] "In-editor persona suggestions"); browser window ids are a per-tab counter; an ssh connection's id is the label of the tab it belongs to; see SSH Tab for id resolution.

### One catalog for every surface

The connections panel, `connections list`, and `connections close` completion all read one catalog of a tab's connections (`connectionCatalog` in `src/connection/catalog.ts`), so a name any of them shows is one `connections close` accepts. Each entry carries the `<kind>:<id>` that closes it, the text the panel shows, and whether it belongs to the tab itself or is reachable only from the app-wide list (another tab's ssh connection, a database the tab never opened). An agent session appears once its handshake has named it.

### `connections list`

Lists all open connections, one `<kind>:<id>` per line: first the current tab's own — its shell (`shell:<name>`), its core ACP connection, when supported (`acp:<provider/model>`), its monitors (`acp:<monitor>`) and editor personas (`acp:<persona>`), its browser windows (`browser:<id>`), its own ssh connection, its terminals (`terminal:<program>`), and the databases it opened (`sqlite:<name>`) — then every other tab's ssh connection and every other open SQLite connection. An ssh connection is listed by its tab's label with the destination in parentheses (`ssh:bastion (admin@host)`), global like sqlite since an ssh tab has no command bar of its own to list from. When none are open it returns `No open connections.` The list and any `Usage:` or validation error are written as the command's own output, so a shell tab that runs `connections list` prints them like any other command reply.

### `connections close <kind>:<id>`

The outcome of a close is reported as a notification attributed to the tab that ran the command, never as a transcript line. A `Closed connection <kind>:<id>.` result is a `connection-closed` notification. A `No open connection <kind>:<id>.` result, or a close that fails with an error (`Could not close connection <kind>:<id>: <reason>.`, the reason being the error's first line), is a `connection-close-failed` error notification. The messages each kind returns are listed below.

- `sqlite:<name>` — closes the database connection via `closeConnection(name)`. Returns `Closed connection sqlite:<name>.` or `No open connection sqlite:<name>.` if none was open. The connection reopens on the next `db` command.
- `shell:<name>` — if `<name>` matches this tab's shell, kills the tab's shell process and clears its busy indicator; the shell respawns (restoring its cwd) on the next shell command. A mismatched or absent shell reports a `No open connection …` message.
- `acp:<name>` — on an editor tab, if `<name>` matches one of that tab's open persona connections, closes just that connection; a later request to that persona in the same tab opens a fresh one. Otherwise, if `<name>` matches a monitor started from this tab, stops that monitor, as `unmonitor <name>` would. Otherwise kills the tab's interactive ACP session and clears its status-popup info; it reconnects on the next `acp` prompt. That last step accepts any `<name>`, so a session still connecting, and so not yet named, can be closed, and it reports `Closed connection acp:<provider/model>.` naming the session that actually closed. With nothing to close it reports `No open connection acp:<name>.`
- `terminal:<program>` — kills this tab's live terminal running `<program>` (an inline terminal card, or a harness tab's process), which then exits through the normal PTY-exit path; a harness tab closes with it. A remote tab's ssh transport is never matched. Returns `Closed connection terminal:<program>.` or `No open connection terminal:<program>.`.
- `browser:<id>` — closes that window in the current tab's browser (async; its notification is sent once the window has closed). Returns `Closed connection browser:<id>.` or `No open connection browser:<id>.`. Closing the tab's last window ends that tab's browser process.
- `ssh:<id>` — kills the matching ssh tab's PTY (`<id>` matched against an ssh tab's label first, then its destination), which then closes the tab through the normal PTY-exit path. Failing that, `<id>` is matched the same way (label first, then address) against a **remote** tab's channel and that channel is killed. A remote channel may be shared by the launching tab, agents joined through ➕, and a file navigator; explicitly closing its `ssh:` connection closes every tab and navigator using it. Returns `Closed connection ssh:<id>.` or `No open connection ssh:<id>.` if nothing matches. See SSH Tab and `remote-server.md`.

Pressing `Tab` at the target of `connections close` completes against the same `<kind>:<id>` strings `connections list` prints (without the ssh destination), so a connection can be closed by completing and running `connections close <string>`. Only the plural command offers that close-target completion; `connection close` has none.

### Lifecycle integration

Closing a tab kills that tab's shell, ACP, and browser connections — and, for an editor tab, every one of its open persona connections — (SQLite connections, being global, are untouched). Quitting the app, closing the last tab, and the component-unmount cleanup all additionally close every tab's browser and call `closeAllConnections()` to close every open SQLite connection.

### Validation

A close target must be `<kind>:<id>` with a known kind (`sqlite`, `shell`, `acp`, `browser`, `ssh`, `terminal`) and a non-empty id; otherwise a descriptive error is returned with its exact wording, including `Usage: connections close <kind>:<id>`, the unknown-kind list, and the missing-id message. A bare `connections` or `connection` opens the connections tab instead of reporting usage, and any other text is a lookup rather than an unrecognized action.

### Connection window

A small titled `connections` panel (`ConnectionWindow`) floats at the top-right of the active tab, listing that tab's live connections on separate lines: the shell + working directory (`bash:~/dir`) once a shell is running, the ACP agent as `acp:<provider/model>` once its handshake has named it, each browser window as `browser:<id> (<mode>)`, and `sqlite:<name>` for each database the tab has accessed. The window appears whenever any of these exist. Although SQLite connections are global, each is attributed to the tab(s) that ran a `db` command against it (tracked in `tabDbConns`), so a tab's window reflects the databases it has opened; the list is filtered against the live registry (`isConnectionOpen`), so closing a connection (`connections close sqlite:<name>` or `db sqlite delete`) removes it from the window.

Over an ssh tab, this panel shows only that tab's own `ssh:<destination>` row (no `terminal:` row — the ssh session is the tab's only PTY) and is shown even though the whole tab is a terminal, unlike other harness tabs where the panel is suppressed since the terminal already *is* the connection. See SSH Tab.

A database opened by the SQL browser tab ([[sql-database]]) is a global connection, so it appears in `connections list` and in tab-completion app-wide as a `sqlite:<name>` row. It does **not** appear in the browser tab's own panel: attribution is recorded when a `db` command runs *in* a tab, and a plugin tab runs none.

A **remote** tab (one launched with `on <address>`) shows *both* rows: `ssh:<address>` for the transport it runs over, and `terminal:<program>` for the process on the far side — a remote claude harness reports `terminal:claude`, exactly as a local one does, since the ssh session it runs over is listed as the transport rather than masquerading as one of the tab's processes. `connections list` includes the remote tab's ssh connection globally, alongside every open ssh tab's, as `ssh:<label> (<address>)`, and tab-completion offers `ssh:<label>` for remote tabs too. See `remote-server.md`.

In the web app, the tab's metadata bar carries a connections button (a link icon) alongside its other buttons. When the tab has at least one live connection, the button is active: hovering it shows the connections window, moving away hides it again, and clicking pins the window open until the button is clicked a second time. When the tab has no live connections, the button is dark and unclickable, with a tooltip explaining there are none. Each time a tab becomes the active tab, its connections window (if non-empty) auto-shows immediately and then fades away after five seconds; moving the pointer onto the button or the window during that auto-show cancels the fade and hands control back to plain hover behavior, while clicking at any point pins or unpins the window regardless of where it is in that sequence. A window that was empty auto-shows the same way when its tab gains its first connection. A harness tab that is not the active tab, such as one shown in the other split pane, never auto-shows its connections window, and keeps it hidden while inactive even if it was pinned. A non-ssh harness tab has no connections button, since the terminal is already the connection; an ssh harness tab keeps both the connections and schedule buttons.

A row that carries a durable ACP record opens or focuses that record's connection tab, and a row that carries the tab's own live ACP reference opens or focuses the current session's connection tab. Such a row is operable by pointer and by Enter or Space. Monitor and editor-persona rows have no durable record target and stay as they are. While a run started from this tab is live, the caller's window also lists it under the ACP kind as `Agent: <task filename>`; that row carries the run's durable record and opens its connection tab, and it leaves the window when the run ends.

A row that already offers a transcript snapshot keeps that separate button. The snapshot is a point-in-time, read-only copy and is never the row-opening action: pressing it does not open the connection tab, and pressing the row does not open a snapshot. Surfaces that render no snapshot button today, including shell and harness windows, gain none. See [[connections-tab]].

### Connection record history

Connection record history belongs to the record tab described in [[connections-tab]].

An editor tab carries the same connections button and window, listing its open persona connections (each shown as `<persona> (acp)`) alongside any other connections that tab has opened. Unlike every other kind of connection row, an editor tab's persona connection rows carry their own small close control; clicking it closes just that one persona's connection immediately, the same as running `connections close acp:<persona>`, without affecting any other open persona connection in that tab. Any other row in that window, including a running agent row, carries no close control there: pressing it opens its record tab, where the run's **Terminate** remains its control. A persona connection whose agent exits or fails to start leaves the window on its own, and the next request to that persona opens a fresh one (see [[editor-tab]] "In-editor persona suggestions").

### Transcript button on ACP connection rows

An ACP connection row that offers a transcript snapshot carries a small clipboard-icon button, alongside any close control the row already has. Clicking it opens that session's transcript as a point-in-time, read-only snapshot in a scrollable editor tab: the tab's own agent shows its full tab transcript, a monitor row shows its accumulated exchange tagged into "sent to model" and "model response" blocks, and an editor-persona row shows that persona's own accumulated exchange the same way. The snapshot reflects the exchange at the moment of the click — clicking the button again opens a fresh snapshot rather than updating the first one. A session that has not yet exchanged anything still opens a tab, reading `No transcript yet.`, so every click gives visible feedback. A row without a snapshot button, such as a shell or harness agent row or a running agent-run row, opens its record tab when pressed instead; its lack of a snapshot control is deliberate because there is no transcript scope to show.

### `connection` and `connections` commands

`connections` and `connection` are the same command under two names. Bare invocation of either name opens or focuses the connections tab, and also returns a docked list to the centre. `connections left` and `connections right` dock it, while singular `connection left` and `connection right` are lookup text. `connections list` shows every open connection; `connections close <kind>:<id>` closes one, where `<kind>` is `sqlite`, `shell`, `acp`, `browser`, `ssh`, or `terminal`. Trailing arguments after those forms are ignored, and their list output, close notifications, and completion are unchanged.

Any other text is resolved as a connection reference. Lookup first tries the text as a retained record's exact UUID, then resolves the invoking tab's own `acp:<id>` session, then a live `<kind>:<id>` target, preferring the invoking tab's own row when several tabs hold the same connection and otherwise the first matching row, by focusing the tab that owns it, and finally the complete title of a retained record, newest match first; the most recently updated matching record wins. A retained record's title can match even when that record is closed or belonged to another tab. Title matching ignores letter case but compares the whole title, including its generated `ACP:` or `Agent:` prefix and every interior space; it is not a prefix, substring, fuzzy, or whitespace-normalized match, so a title containing two spaces does not match one containing a single space. Quotation marks are not syntax: a quoted argument is matched as the literal text including its quotes. A lookup with no match reports `No connection matching "<text>".` using the complete entered text, without its surrounding whitespace and with its original case and interior spacing.

### Parked remote sessions

This surface describes connections open *now*, so a remote session that has been detached appears in
neither `connections list` nor the connections window — it has no open connection to list. Those are
listed in the sessions tab, which shows both the remote sessions this janissary is attached to and
the ones still running on their hosts awaiting attachment. See [[sessions-tab]].
