# Connections

<img class="agent-float" src="/agents/mahir-south.png" alt="" />

The `connection` command lists and closes the long-lived connections a tab holds: its shell, its ACP agent and monitors, its browser windows, its terminals, plus the app-wide SQLite and SSH connections. Each connection is addressed as `<kind>:<id>`:

```
connection list
connection close shell:bash
```

A bare `connection` prints `Usage: connection <list|close> [kind:id]  (e.g. connection close sqlite:mydb)`, and so does an action it doesn't know, such as `connection status`.

## Kinds and scope

| Kind | Id | Scope |
|---|---|---|
| `sqlite` | database name | Global, shared across every tab |
| `shell` | shell program name (`bash`, `zsh`, …), taken from your `SHELL` environment variable; `bash` when it isn't set | Current tab |
| `acp` | a supported tab's ACP provider and model (`opencode/big-pickle`); a monitor's name; a persona's name on an [editor tab](/user-documentation/tab-types/editor-persona-query) | Current tab |
| `browser` | window id (`w1`, `w2`, …) | Current tab |
| `ssh` | the ssh tab's label, or its destination as typed | Global; an ssh tab has no command bar of its own |
| `terminal` | the program the terminal runs (`vim`, `claude`, …) | Current tab |

## Listing connections

<img class="agent-float left" src="/agents/orhan-south-east.png" alt="" />

`connection list` prints one line per open connection. The current tab's own come first: its shell (`shell:bash`), its ACP connection when supported (`acp:opencode/big-pickle`), its monitors and editor personas (`acp:<name>`), its browser windows (`browser:w1`), its terminals (`terminal:vim`), and the SQLite databases it has used. After those come every other ssh tab and every other open SQLite connection, since those are global. A database you've opened in the [SQL database browser](/user-documentation/tab-types/sql-browser) is one of these: it's listed as `sqlite:<name>` and offered by tab completion, but it isn't credited to the browser tab, so it never shows in that tab's own panel. An ssh connection shows its tab's label with the destination in parentheses, like `ssh:devbox (admin@devbox)`. A monitor and an editor persona are listed as `acp:` connections too, under the name you address them by; the model behind a monitor, and the `monitor:` prefix, belong to the [panel](#the-connections-window), not to this list. A [remote](/user-documentation/advanced-agents/remote-agents) agent or harness started with `on <address>` is listed here too, under the label of the tab that runs it with its address in parentheses, the same shape as a local ssh tab. Every name on the list is one you can pass straight to `connection close`. With nothing open it prints `No open connections.`

The tab's own ACP agent only appears once its handshake has named it, so a session you have just started with an `acp` prompt can be missing from the list for a moment.

## Closing a connection

`connection close <kind>:<id>` closes one connection and reports what happened:

- `sqlite:<name>`: closes the database connection. It reopens automatically the next time a `db` command or the SQL database browser uses that name.
- `shell:<name>`: kills the tab's shell process. `<name>` is not compared. A shell tab has exactly one shell, and closing the connection closes it whatever you typed after the colon, so `connection close shell:zsh` on a bash machine closes the bash shell. A fresh shell spawns, restoring its working directory, on your next shell command.
- `acp:<name>`: closes one ACP connection. Three things can match, and the first match wins. On an editor tab, `<name>` can be one of its personas: only that persona's connection closes, the tab's other persona connections stay open, and the next request to that persona opens a fresh one. Next, if `<name>` is one of the tab's monitors, only that monitor stops, the same as `unmonitor <name>`. Anything else kills the tab's own ACP session, which reconnects on your next `acp` prompt.
- `browser:<id>`: closes that window. Closing a tab's last window ends its browser process.
- `ssh:<id>`: kills the matching ssh tab's terminal, which closes the tab. `<id>` matches the tab's label first, then its destination.
- `terminal:<program>`: kills the tab's terminal running that program. An inline terminal ends; a harness tab closes with it. A remote tab's ssh transport never answers to a `terminal:` id — it is the `ssh:` row, as above.

Each case reports `Closed connection <kind>:<id>.` on success, or `No open connection <kind>:<id>.` when nothing matched, with two exceptions worth knowing. A successful `shell` close names the shell it actually killed, so `connection close shell:zsh` on a bash machine reports `Closed connection shell:bash.`. And closing an ACP session that is still connecting, before it has a name, works — with nothing to name it in the reply, it echoes the id you typed, so `connection close acp:agent` reports `Closed connection acp:agent.`. Press `Tab` at the close target to complete against the same names `connection list` prints; see [Tab completion](/user-documentation/command-bar/tab-completion). Closing a browser window takes a moment: until it settles, the command line sits in your transcript marked as running with nothing after it yet.

## When a close target is malformed

`connection close` needs a `<kind>:<id>` pair, and a half-typed one is refused before anything is closed:

| What you typed | What you get |
|---|---|
| `connection close` | `Usage: connection close <kind>:<id>` |
| `connection close mydb` | `Invalid connection "mydb". Expected <kind>:<id>, e.g. sqlite:mydb.` |
| `connection close postgres:notes` | `Unknown connection kind "postgres". Expected one of: sqlite, shell, acp, browser, ssh, terminal.` |
| `connection close sqlite:` | `Missing id in "sqlite:".` |

Those are the whole list, and none of them closes anything on the way.

## The connections window

A `connections` panel floats at the top right of a shell tab or an editor tab and lists that tab's live connections. The rows read like the entries in `connection list`, with a little more detail:

- Its shell and working directory, such as `bash:~/dir`.
- Its ACP agent, as `acp:<provider/model>`.
- Each [monitor](/user-documentation/automation/monitoring) it started, as `monitor:<persona> (<provider/model>)`. The persona name is also the monitor's name for `unmonitor` and `monitor ask`. The provider and model appear once the session has connected.
- Each browser window with its mode, such as `browser:w1 (headless)`.
- Each terminal the tab runs, as `terminal:<program>`.
- On a [remote](/user-documentation/advanced-agents/remote-agents) tab, the `ssh:<address>` transport it runs over, next to its terminals.
- Every SQLite database the tab has queried. A database you close with `connection close sqlite:<name>` or delete with `db sqlite delete` drops off the list.

An [editor tab](/user-documentation/tab-types/editor-persona-query) lists each persona it has consulted as `<persona> (acp)`. Those rows are the one kind with their own ×. Clicking it closes just that persona's connection, the same as `connection close acp:<persona>`.

<img class="agent-float" src="/agents/selim-south-west.png" alt="" />

Over an ssh tab, the panel shows only that tab's own `ssh:<destination>` row, and its metadata bar keeps both the connections and schedule buttons. Any other harness tab has no connections button at all, since its terminal already is the connection. It keeps its schedule button.

In the web app, a link icon in the tab's metadata bar opens this panel. It lights up whenever the tab has a live connection, and stays dark and unclickable, with a tooltip saying there are none, when it doesn't. Hovering the lit icon shows the panel; moving away hides it again. Clicking pins the panel open until you click a second time.

The panel also shows itself for a moment. Switching to a tab with live connections auto-shows its panel for five seconds before it fades. A tab with no connections auto-shows the panel the same way the moment it gains its first one. Moving the pointer onto the icon or panel during the auto-show cancels the fade and hands off to normal hover behavior. A harness tab that isn't the active tab, such as the one in the other split pane, never auto-shows its panel. It stays hidden even if you had pinned it.

## Read what an agent session has said

On an editor tab, every ACP row in the panel carries a small clipboard button. That covers a `monitor:<name>` row, a `<persona> (acp)` row, and the tab's own `acp:<provider/model>` row when it has one. The panels on shell tabs and harness tabs list the same kinds of row, but only the editor tab's panel draws the button.

Click it to open a snapshot as plain text in an [editor tab](/user-documentation/tab-types/editor). It's the way to read what a monitor or a persona has actually been sent and what it answered. What you get depends on the row:

- A persona row gives you that persona's exchange alone, with each block marked as sent to the model or as the model's response.
- A monitor row gives you the same kind of exchange, but only for a monitor that reports in a [reporting tab](/user-documentation/automation/monitoring). An inline monitor, which posts into the tab you started it from, has nothing to show and opens `No transcript yet.`.
- The tab's own row gives you the tab's whole transcript, since the session and the tab are the same conversation.

What you get is a snapshot taken at the moment you clicked, not a live view. Click again for a fresh one; the first tab stays as it was. A session that hasn't exchanged anything yet still opens a tab, reading `No transcript yet.`, so the button always does something visible.

## Closing connections automatically

Closing a tab kills that tab's shell, ACP, and browser connections; SQLite connections, being global, are untouched. Quitting the app or closing the last tab additionally closes every browser window and every open SQLite connection.
