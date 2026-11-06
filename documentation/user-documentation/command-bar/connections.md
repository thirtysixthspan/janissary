# Connections

<img class="agent-float" src="/agents/mahir-south.png" alt="" />

`connections` and its singular alias `connection` open the connections tab, the app-wide list of every live connection and every retained ACP or agent session. The same commands list live connections, close one by its connection string, focus a live connection's owning tab, or open a retained session by its UUID or full title. Each live connection is addressed as `<kind>:<id>`:

```
connections list
connections close shell:bash
connections
connections ACP: explain this test
```

A bare `connections` or `connection` opens or focuses the connections tab. Running it again while the list is docked returns the list to the centre. Only the plural form docks: `connections left` and `connections right` move the list into a sidebar. The singular `connection left` and `connection right` are lookup text, not dock commands.

## Kinds and scope

| Kind | Id | Scope |
|---|---|---|
| `sqlite` | database name | Global, shared across every tab |
| `shell` | shell program name (`bash`, `zsh`, …), taken from your `SHELL` environment variable; `bash` when it isn't set | Current tab |
| `acp` | a supported tab's ACP provider and model (`opencode/big-pickle`); a monitor's name; a persona's name on an [editor tab](/user-documentation/tab-types/editor-persona-query) | Current tab |
| `browser` | window id (`w1`, `w2`, …) | Current tab |
| `ssh` | the ssh tab's label, or its destination as typed | Global; an ssh tab has no command bar of its own |
| `terminal` | the program the terminal runs (`vim`, `claude`, …) | Current tab |

Non-ACP connections appear in the connections tab only while they are live. Tracked core ACP sessions and agent runs stay listed after they close. Monitor and editor-persona ACP rows are live-only: they leave the list when their connection closes, are not retained, and read `Open`. A tracked core ACP record reads `Running`, `Idle`, or `Closed`.

## List live connections

`connections list` prints one line per open connection, in a shell tab as well as anywhere else you type it. The current tab's own come first: its shell (`shell:bash`), its ACP connection when supported (`acp:opencode/big-pickle`), its monitors and editor personas (`acp:<name>`), its browser windows (`browser:w1`), its terminals (`terminal:vim`), and the SQLite databases it has used. After those come every other ssh tab and every other open SQLite connection, since those are global. A database you've opened in the [SQL database browser](/user-documentation/tab-types/sql-browser) is one of these: it's listed as `sqlite:<name>` and offered by tab completion, but it isn't credited to the browser tab, so it never shows in that tab's own panel. An ssh connection shows its tab's label with the destination in parentheses, like `ssh:devbox (admin@devbox)`. A monitor and an editor persona are listed as `acp:` connections too, under the name you address them by; the model behind a monitor, and the `monitor:` prefix, belong to the [connections window](#the-connections-window), not to this list. A [remote](/user-documentation/advanced-agents/remote-agents) agent or harness started with `on <address>` is listed here too, under the label of the tab that runs it with its address in parentheses, the same shape as a local ssh tab. Every name on the list is one you can pass straight to `connections close`. With nothing open it prints `No open connections.`

The tab's own ACP agent only appears once its handshake has named it, so a session you have just started with an `ask` prompt can be missing from the list for a moment.

<img class="agent-float left" src="/agents/orhan-south-east.png" alt="" />

## Open a connection or a retained session

A bare `connections` or `connection` opens the list. Any other text is looked up as a connection reference, in this order:

1. The exact UUID of a retained ACP or agent record.
2. The invoking tab's own ACP session, written `acp:<provider/model>`.
3. A live `<kind>:<id>` connection, which focuses the tab that owns it.
4. The complete title of a retained ACP or agent record, newest first.
5. The name the list shows for a retained record, `acp:<tab name>` or `agent:<tab name>`, ignoring letter case, newest first.

Both command names accept the same lookup. A real multiword title works, including its generated prefix and spacing:

```
connection ACP: explain this test
connections ACP: explain this test
connections acp: explain this test
```

Title matching ignores letter case. Otherwise it compares the whole stored title, including its `ACP:` or `Agent:` prefix and every interior space, and picks the most recently updated match. It is not a prefix, substring, fuzzy, or whitespace-normalized match. Don't wrap the title in quotation marks: quotation marks are ordinary text, not syntax. An incomplete or differently spaced title reports exactly `No connection matching "<text>".`

The [connections window](#the-connections-window) and the connections tab open retained records the same way. In the connections tab, a monitor or editor-persona row is live-only: it focuses its owning tab and never opens a record. In a tab's connections window, those rows stay snapshot-only and do not open or focus a record.

## The connections tab

The connections tab is titled **connections**. It is a table laid out like the sessions tab. Open connections come first, and closed ones are grouped together below them. Within each of those groupings, rows are grouped by host, with `Local` first and other hosts after it in alphabetical order, and the most recently active comes first within each host. A heading row names the columns: **Host**, **Tab**, **ID**, **Name**, **State**, and **Last activity**, followed by an actions column. **Host** reads the remote host for a connection on a remote or ssh tab, and `Local` for everything else, including every SQLite database. **Tab** is the tab that owns the connection. **ID** is a retained session's UUID, or the id a live connection takes in `connections close <kind>:<id>`. **Name** reads `acp:<tab name>` for an ACP session and `agent:<tab name>` for an agent run, matching its connection tab's title. A live connection reads its connection string, such as `sqlite:<name>`. One tab's sessions share a name, so the ID tells them apart. **Last activity** reads like `3m ago`, and stays empty when no activity is known. Hover a row to see a session's own title and the connection kind. An idle ACP session's state is highlighted, and a row that has closed, completed, failed, or been terminated is dimmed. Use Up, Down, Home, End, and Enter to move and open rows. A row also opens on a second click on the same row.

A docked list stacks each row onto two lines so it reads in a narrow sidebar, the way a docked sessions list does. The first line holds the connection's name and its actions. The second holds its state, host, tab, and last activity. The columns come back when the list returns to the center.

Opening a non-ACP row focuses the tab that owns the connection. A SQLite row focuses the first tab in strip order that has the database attributed, or does nothing when no tab has it. An ACP or agent record row opens its connection tab.

A live SQLite row is titled `sqlite:<name>`, and its owning-tab column reads exactly `global`, whether or not any tab has the database attributed. Its **Close** control closes the database app-wide, exactly like `connections close sqlite:<name>`, including when no tab is attributed. Focus and close are separate: opening the row uses the first attributed tab, and the close control still acts on the database everywhere.

A live row offers **Close**, which reports the same notification as `connections close <kind>:<id>`. The `system` tab's shell is the exception: its rows have no **Close**, since that shell keeps running for system schedules. An open ACP record row's **Close** ends that session. A closed ACP record row offers **Delete**, which asks `Delete "<title>"?` before removing it. An agent record row has no list control; its **Terminate** control is in its connection tab. **Close** is a circled-cross icon and **Delete** a trash icon, both in the actions column. An empty list reads `No connections yet`.

Closed ACP records are kept per project. Records closed more than 30 days before startup are removed at startup, not on a rolling timer. An open record cannot be deleted. The connections tab itself is a live, in-memory view and is not restored at restart, but the retained ACP and agent records are.

## Connection tabs

A connection tab shows one retained ACP session or one agent run. It's titled with its kind and the tab that started it: `acp:<tab name>` for an ACP session, `agent:<tab name>` for an agent run. Its metadata bar reads like the session's row in the list: **Host**, **Tab**, **Connection ID**, and **Connection Name**, then the model, the **Connection State**, and when it started. Hover a field to see what it is. Hover the name to also see the session's own title. The controls available for that status are icons at the bar's right edge: a crosshair focus icon, a stop icon, and a circled-cross close icon. Hover one to see its name. **Focus tab** brings the tab that started the session or run to the front. It's there whatever the record's status, as long as that tab is still open. A tab that later takes a closed tab's name doesn't count, and a record from before a restart has no focus icon. A core ACP session offers **Cancel** as its stop icon and **Close session** as its close icon. Cancel appears while the session is running and leaves it open, keeping the same session and record for the next prompt. Close session ends the connection. An agent run offers **Terminate** as its stop icon, and has no close icon. Terminate ends only that run, exactly like the monitor's Terminate. The record tab's control is disabled from the click until the record reports its terminal status and is then removed, while the monitor's own **Terminate** stays visible and disabled through cleanup. A closed session's tab is read-only and has no prompt input.

Each prompt block holds the prompt, then its activity in order, each entry labelled `message`, `thought`, `tool`, `plan`, or `permission`, then the final answer. Thought and tool entries start collapsed; click one to expand it. Final answers render as Markdown.

An active connection tab follows new output while you are at or near the bottom, including text arriving in the current activity entry. Scrolling away pauses following until you return. The tab opens with the newest 20 prompt blocks. Reaching the top loads 20 older blocks, and older blocks also load automatically while the history fits the tab, until it scrolls or no older blocks remain. Loading keeps your place in the view.

## Close a live connection

`connections close <kind>:<id>` closes one live connection and reports what happened as a [notification](/user-documentation/tab-types/notifications), not as a line in your transcript:

- `sqlite:<name>`: closes the database connection. It reopens automatically the next time a `db` command or the SQL database browser uses that name.
- `shell:<name>`: kills the tab's shell process. `<name>` is not compared. A shell tab has exactly one shell, and closing the connection closes it whatever you typed after the colon, so `connections close shell:zsh` on a bash machine closes the bash shell. A fresh shell spawns, restoring its working directory, on your next shell command. A command still running in a local shell ends its reply with `(shell exited)` once it stops producing output; see [Shell commands](/user-documentation/command-bar/shell).
- `acp:<name>`: closes one ACP connection. Three things can match, and the first match wins. On an editor tab, `<name>` can be one of its personas: only that persona's connection closes, the tab's other persona connections stay open, and the next request to that persona opens a fresh one. Next, if `<name>` is one of the tab's monitors, only that monitor stops, the same as `unmonitor <name>`. Anything else kills the tab's own ACP session, which reconnects on your next `ask` prompt.
- `browser:<id>`: closes that window. Closing a tab's last window ends its browser process.
- `ssh:<id>`: kills the matching ssh tab's terminal, which closes the tab. `<id>` matches the tab's label first, then its destination.
- `terminal:<program>`: kills the tab's terminal running that program. An inline terminal ends; a harness tab closes with it. A remote tab's ssh transport never answers to a `terminal:` id; it is the `ssh:` row, as above.

Each case reports `Closed connection <kind>:<id>.` on success. When nothing matched you get an error notification reading `No open connection <kind>:<id>.`, and when closing fails partway it reads `Could not close connection <kind>:<id>: <reason>.` There are two exceptions worth knowing. A successful `shell` close names the shell it actually killed, so `connections close shell:zsh` on a bash machine reports `Closed connection shell:bash.`. And closing an ACP session that is still connecting, before it has a name, works, with nothing to name it in the reply it echoes the id you typed, so `connections close acp:agent` reports `Closed connection acp:agent.` Press `Tab` at the close target to complete against the same names `connections list` prints; see [Tab completion](/user-documentation/command-bar/tab-completion). Only `connections close` completes. `connection close` accepts the same targets but offers no completion. Closing a browser window takes a moment, so its notification arrives once the window has closed.

## When a close target is malformed

`connections close` needs a `<kind>:<id>` pair, and a half-typed one is refused before anything is closed:

| What you typed | What you get |
|---|---|
| `connections close` | `Usage: connections close <kind>:<id>` |
| `connections close mydb` | `Invalid connection "mydb". Expected <kind>:<id>, e.g. sqlite:mydb.` |
| `connections close postgres:notes` | `Unknown connection kind "postgres". Expected one of: sqlite, shell, acp, browser, ssh, terminal.` |
| `connections close sqlite:` | `Missing id in "sqlite:".` |

Those are the whole list, and none of them closes anything on the way.

## The connections window

A `connections` panel floats at the top right of a shell tab or an editor tab and lists that tab's live connections. The rows read like the entries in `connections list`, with a little more detail:

- Its shell and working directory, such as `bash:~/dir`.
- Its ACP agent, as `acp:<provider/model>`.
- Each [monitor](/user-documentation/automation/monitoring) it started, as `monitor:<persona> (<provider/model>)`. The persona name is also the monitor's name for `unmonitor` and `monitor ask`. The provider and model appear once the session has connected.
- Each browser window with its mode, such as `browser:w1 (headless)`.
- Each terminal the tab runs, as `terminal:<program>`.
- On a [remote](/user-documentation/advanced-agents/remote-agents) tab, the `ssh:<address>` transport it runs over, next to its terminals.
- Every SQLite database the tab has queried. A database you close with `connections close sqlite:<name>` or delete with `db sqlite delete` drops off the list.

A row that carries a retained ACP or agent record opens that record's connection tab. A row for the tab's own live ACP session opens its current connection tab. Monitor and editor-persona rows have no retained record, so they keep their snapshot behavior and do not open a record tab. While a run started from this tab is live, the window also lists it as an `Agent: <task filename>` row; that row opens the run's connection tab and leaves the window when the run ends.

An [editor tab](/user-documentation/tab-types/editor-persona-query) lists each persona it has consulted as `<persona> (acp)`. Those rows are the one kind with their own ×. Clicking it closes just that persona's connection, the same as `connections close acp:<persona>`. A running agent row has no × there; its **Terminate** is in its record tab.

<img class="agent-float" src="/agents/selim-south-west.png" alt="" />

Over an ssh tab, the panel shows only that tab's own `ssh:<destination>` row, and its metadata bar keeps both the connections and schedule buttons. Any other harness tab has no connections button at all, since its terminal already is the connection. It keeps its schedule button.

In the web app, a link icon in the tab's metadata bar opens this panel. It lights up whenever the tab has a live connection, and stays dark and unclickable, with a tooltip saying there are none, when it doesn't. Hovering the lit icon shows the panel; moving away hides it again. Clicking pins the panel open until you click a second time.

The panel also shows itself for a moment. Switching to a tab with live connections auto-shows its panel for five seconds before it fades. A tab with no connections auto-shows the panel the same way the moment it gains its first one. Moving the pointer onto the icon or panel during the auto-show cancels the fade and hands off to normal hover behavior. A harness tab that isn't the active tab, such as the one in the other split pane, never auto-shows its panel. It stays hidden even if you had pinned it.

## Read a session as plain text

A plain-text snapshot is not a connection tab and not a live view. It is a point-in-time copy of one session's exchange, opened in an editor tab from a snapshot button. Only an editor tab's connections panel draws those buttons: a `monitor:<name>` row, a `<persona> (acp)` row, and the editor tab's own `acp:<provider/model>` row when it has one. Shell and harness rows have no snapshot button, because their full view is the connection tab and, for a shell, a separate terminal transcript file.

Click the clipboard button to open the snapshot. What you get depends on the row:

- A persona row gives you that persona's exchange alone, with each block marked as sent to the model or as the model's response.
- A monitor row gives you the same kind of exchange, but only for a monitor that reports in a [reporting tab](/user-documentation/automation/monitoring). An inline monitor, which posts into the tab you started it from, has nothing to show and opens `No transcript yet.`.
- The tab's own row gives you the tab's whole transcript, since the session and the tab are the same conversation.

What you get is a snapshot taken at the moment you clicked, not a live view. Click again for a fresh one; the first tab stays as it was. A session that hasn't exchanged anything yet still opens a tab, reading `No transcript yet.`, so the button always does something visible.

A shell's **Open transcript** button is separate again: it opens the terminal's own plain-text transcript file, not an ACP exchange. See [Read a shell session's transcript](/user-documentation/command-bar/shell#read-a-shell-session-s-transcript).

## Closing connections automatically

Closing a tab kills that tab's shell, ACP, and browser connections; SQLite connections, being global, are untouched. Quitting the app or closing the last tab additionally closes every browser window and every open SQLite connection.
