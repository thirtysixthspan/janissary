# Application commands

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

These commands manage the app itself — the current tab's transcript and name, the syntax theme, and quitting. For creating tabs see [Agents](/user-documentation/getting-started/agents); for opening files and pages see [Opening files and pages](/user-documentation/tab-types/opening-files).

| Command | What it does |
|---|---|
| `help` | List the available commands and key bindings |
| `state` | Show the current agent's saved state fields (long values truncated) |
| `newfile <file>` | Open a new unsaved text file; see [Creating a file or directory](/user-documentation/tab-types/opening-files#create-a-file-or-directory) |
| `newdir <directory>` | Create a directory immediately under an existing parent; see [Creating a file or directory](/user-documentation/tab-types/opening-files#create-a-file-or-directory) |
| `open [external] [page] <target>` | Open a file, a web page, or an external application; see [Opening files and pages](/user-documentation/tab-types/opening-files) |
| `edit <file>[:line]` | Open a file for editing, picking the editor by file type; see [Opening a file to change it](/user-documentation/tab-types/opening-files#opening-a-file-to-change-it-edit) |
| `clear` | Empty the current tab's transcript — other tabs are unaffected |
| `rename [newname]` | Set (or, bare, clear) the tab's display alias — see [Tabs](/user-documentation/getting-started/tabs) |
| `theme [name]` | Switch the application color theme; bare form opens a picker |
| `syntax theme [name]` | Switch the editor syntax theme; bare form opens a picker |
| `notifications [left\|right]` | Open the [notifications](/user-documentation/tab-types/notifications) feed, optionally docked in a sidebar |
| `notifications clear` | Empty the notifications queue, record file, and any toasts on screen |
| `notify <message>` | Push a custom line into the [notifications](/user-documentation/tab-types/notifications) feed |
| `plugins` | List the [bundled tab plugins](/user-documentation/command-bar/plugins) with their version and state |
| `conversations [left\|right\|<title>]` | Open or dock the [conversation list](/user-documentation/tab-types/conversations), or reopen a conversation by its title |
| `quit` | Exit the application, after confirmation |

## `help`

`help` prints the in-app quick reference: every command with a one-line description, then the key bindings. It's the same text this tab shows you when you type `help`, so it is a reminder rather than a guide. If that file can't be read, `help` falls back to a single summary line naming the built-in commands and reminding you that `shell ` runs something in the shell, `/` runs a built-in, and `Ctrl+R` or `hist` opens command history. Each full guide is one click away in the app's help menu.

## `state`

`state` prints what the current tab has saved, one field per block, so you can see exactly what `janus --relaunch` would bring back:

```
> state
```

Each tab's state is one JSON file under `.janissary/state/`, named after the tab. `state` reads that file and prints the fields it holds. For an agent tab those are `name`, `active`, `dotColor`, `number`, `focus`, `group`, `groupColor`, `title`, `cwd`, `offline`, `cmdHistory`, `log`, `context`, `commandQueue`, `workspaceDir`, and `schedule`. The transcript is in `log`, the commands you have run in `cmdHistory`, the shell's working directory in `cwd`, and any [schedules](/user-documentation/automation/scheduling) attached to the tab in `schedule`. A long list or nested value is cut to its last ten lines behind a `... (N lines omitted)` marker, so the end of a transcript is what survives.

A tab with no state file reports `No state file found for "<label>".` That is the answer for the `janus` tab on a fresh launch, for every view tab such as an [image](/user-documentation/tab-types/image-viewer) or [page](/user-documentation/tab-types/web-pages) tab, and for a [remote agent](/user-documentation/advanced-agents/remote-agents), since a tab whose shell lives on another machine keeps nothing here.

Work that lands after you close a tab does not put that tab back. A scheduled command that fires, or a shell command that finishes, minutes after the tab is gone writes nothing, so the tab stays closed on the next `--relaunch`. The state directory is wiped on an ordinary launch and kept on `--relaunch`; see [Resuming a session](/user-documentation/getting-started/startup#resuming-a-session-with---relaunch).

## `theme`

`theme <name>` sets the application's color theme — the tab strip, transcript colors, panels, borders, pickers, dialogs, and editor chrome — and applies it immediately, with no restart. It persists to the `theme` key in [`.janissary/config.json`](/user-documentation/getting-started/startup#configuration), so it survives a restart. Names match case-insensitively. An unrecognized name shows an error listing the six built-in themes: `dark` (the default), `light`, `solarized-dark`, `solarized-light`, `nord`, and `dracula`. There are no custom themes.

Bare `theme` opens a picker overlay listing every theme, each row showing a swatch of that theme's own colors next to its name, with the active theme marked. `↑`/`↓` move the selection, `Return` applies it, `Escape` closes, and a row can be clicked.

`theme sync` sets the syntax-highlighting theme to the app theme's name, when a syntax theme with exactly that name exists — otherwise it reports that no matching syntax theme exists and leaves the syntax theme unchanged. The application theme and the syntax theme are independent settings; nothing keeps them in sync automatically, so `theme sync` is the only bridge between them. Today only `nord` exists in both name sets, so sync usually reports no match.

Both `theme <name>` and `syntax theme <name>` have to write the choice into `.janissary/config.json` before they apply it, and a write that fails leaves the setting exactly as it was while still naming what you asked for:

```
Theme set to "light" for this session (config write failed — won't persist).
```

The line reads as though the change took effect for the session. It did not: nothing about the running app changes, so treat that message as "the theme did not change" and check that the file is writable. The wording is the app's, not a choice this page is making.

The theme applies to the whole window — there is no per-tab or per-workspace theming. Rendered Markdown documents follow the active theme too. Embedded web pages and ANSI-colored shell output are deliberately outside the theme, and so are tab dot colors, which are assigned per tab to tell tabs apart rather than drawn from the theme; status indicators such as the running-command highlight, editor saved/error notices, and search-hit highlighting are theme-driven.

**Terminals are the other thing that stays outside it.** A [harness](/user-documentation/advanced-agents/harness) tab, a `shell --pty` takeover, and an [ssh](/user-documentation/advanced-agents/harness#ssh-sessions) session keep the same dark background and light text in all six themes, because a terminal's own palette is the terminal's. Pick `light` and open a harness and the pane stays dark; that is the boundary working, not the theme failing.

## `syntax theme`

<img class="agent-float left" src="/agents/orhan-south-east.png" alt="" />

`syntax theme <name>` sets the syntax-highlighting theme used by every open [editor tab](/user-documentation/tab-types/editor), and persists it so it survives a restart. Names match case-insensitively. An unrecognized name shows an error listing the available themes — which is also a quick way to see what's on offer. Bare `syntax theme` opens a picker overlay instead: arrows move, `Return` picks, `Escape` closes. Any other `syntax` subcommand prints `Usage: syntax theme [name]`.

A picker needs a screen, so a command that arrives from somewhere without one answers with the list instead of opening anything. Another agent running `syntax theme`, or a [schedule](/user-documentation/automation/scheduling) firing it, gets the available themes printed with the active one marked `*`. The same is true of bare `theme`.

## `quit` and the confirmation dialog

<img class="agent-float" src="/agents/selim-south.png" alt="" />

`quit` is the only command that exits the whole app, and it always asks first: a dialog reading "Are you sure you want to quit?" with **Quit (y)** and **Cancel (n)** buttons. **Cancel** is selected by default, so a stray `Enter` is safe. Press `y` to confirm or `n` / `Escape` to cancel; `←`/`→` move the selection. While the dialog is open it traps all other input — clicks outside it and other keys do nothing.

Don't reach for `exit` to leave the app: `exit` is an alias of `close` and closes the current *tab*. The one overlap is the last tab — closing it exits the app, so `close`, `exit`, the tab strip's × and `Cmd+W`/`Ctrl+W` all show the same confirmation dialog there (see [Tabs](/user-documentation/getting-started/tabs)).

### Quitting with unsaved work

If any tab has unsaved changes when you quit, you get a different dialog instead: "You have unsaved changes. Close anyway?" with **Close anyway (y)** and **Cancel (n)**. It answers to the same keys as the ordinary quit dialog, with **Cancel** selected by default.

Confirming quits straight away and throws those edits away. There's no per-file save prompt on this path, so save what you want to keep before you confirm. Cancelling leaves every tab open with its edits intact.

Unsaved work means an [editor tab](/user-documentation/tab-types/editor) holding a buffer you haven't written, or an [image tab](/user-documentation/tab-types/image-viewer) holding edits you haven't saved. Both raise this dialog. This is a different thing from the save prompt you get when closing one tab while others remain — that one offers to save the file first.

Closing the browser window or reloading the page while work is unsaved gets you the browser's own "leave site?" prompt, which is the one close path the app can't put a dialog in front of.

## `notifications` and `notify`


`notifications` opens a single feed tab for background activity: an agent finishing, a message arriving, a scheduled command firing, an agent starting a turn, or a model query being rate limited. All five event types default off in `.janissary/config.json`; rate-limit reports use `notifications.events.rateLimited`. `notifications left` or `notifications right` docks the feed into a sidebar, and `notifications clear` empties the queue, the record file, and any toasts on screen. `notify <message>` and diagnostic messages bypass event toggles and focus suppression. A notification with no feed on screen appears as a toast instead, escalating to a docked feed after three within ten seconds. See [Notifications](/user-documentation/tab-types/notifications) for settings, navigation, and diagnostics.

## Command comments

Anything between `##` markers is stripped from a command before it runs or is saved to history:

```
git status ## check before the demo ##
## just cleaning up ## clear
```

Both run normally with the comment removed, and the gap a comment leaves behind closes up to a single space, so `clear ## note` and `## note ## clear` both run exactly `clear`. A `##` with no closing marker comments out the rest of the line. What is saved to your history is the command with the comments gone, so recalling it later gives you the bare version.

An empty command does nothing at all. A line holding only a comment, and any line holding only spaces, is discarded: nothing is added to the transcript and nothing is added to your history, so pressing `Enter` on a blank command bar is simply ignored rather than logged as an empty entry.

You'll also see the app use this itself: commands fired by the [scheduler](/user-documentation/automation/scheduling) appear in the transcript as `<command> ## scheduled ##`.
