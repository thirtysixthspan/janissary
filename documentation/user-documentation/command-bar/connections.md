# Connections

<img class="agent-float" src="/agents/orhan-south-east.png" alt="" />

The `connection` command lists and closes the long-lived connections a tab holds: its shell, its ACP agent, its browser windows, plus the app-wide SQLite and SSH connections. Each connection is addressed as `<kind>:<id>`:

```
connection list
connection close shell:bash
```

A bare `connection` prints a `Usage:` line.

## Kinds and scope

| Kind | Id | Scope |
|---|---|---|
| `sqlite` | database name | Global, shared across every tab |
| `shell` | shell program name (`bash`, `zsh`, …) | Current tab |
| `acp` | `opencode` | Current tab |
| `browser` | window id (`w1`, `w2`, …) | Current tab |
| `ssh` | the ssh tab's label, or its destination as typed | Global; an ssh tab has no command bar of its own |

## Listing connections

`connection list` prints one line per open connection for the current tab: its shell (`shell:bash`), its ACP agent (`acp:opencode`), its browser windows (`browser:w1`), every open ssh tab (`ssh:<destination>`, shown globally since ssh tabs have no command bar of their own), and every open SQLite connection (`sqlite:<name>`, also global). With nothing open it prints `No open connections.`

## Closing a connection

`connection close <kind>:<id>` closes one connection and reports what happened:

- `sqlite:<name>`: closes the database connection. It reopens automatically on the next `db` command against that name.
- `shell:<name>`: kills the tab's shell process if `<name>` matches. A fresh shell spawns, restoring its working directory, on your next shell command.
- `acp:<name>`: kills the tab's ACP session if `<name>` is `opencode`. It reconnects on your next `acp` prompt.
- `browser:<id>`: closes that window. Closing a tab's last window ends its browser process.
- `ssh:<id>`: kills the matching ssh tab's terminal, which closes the tab. `<id>` matches the tab's label first, then its destination.

Each case reports `Closed connection <kind>:<id>.` on success, or `No open connection <kind>:<id>.` when nothing matched. Press `Tab` at the close target to complete against the current tab's open connection strings; see [Tab completion](/user-documentation/command-bar/tab-completion).

## The connections window

<img class="agent-float left" src="/agents/selim-south-west.png" alt="" />

A floating `connections` panel lists the active tab's live connections: its shell and working directory (`bash:~/dir`), its ACP agent, each browser window with its mode, and every SQLite database the tab has queried. Over an ssh tab, it shows only that tab's own `ssh:<destination>` row.

![The connections panel floating above a tab, listing its open shell and other live connections.](/screenshots/connection-window.png)

In the web app, a plug icon in the tab's metadata bar opens this panel: it lights up whenever the tab has a live connection, and stays dark and unclickable with an explanatory tooltip when it doesn't. Hovering the lit icon shows the panel; moving away hides it again. Clicking pins the panel open until you click a second time. Switching to a tab with live connections auto-shows its panel for five seconds before fading; moving the pointer onto the icon or panel during that window cancels the fade and hands off to normal hover behavior.

## Closing connections automatically

Closing a tab kills that tab's shell, ACP, and browser connections; SQLite connections, being global, are untouched. Quitting the app or closing the last tab additionally closes every browser window and every open SQLite connection.
