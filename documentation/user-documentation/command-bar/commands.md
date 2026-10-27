# Application commands

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

These commands manage the app itself — the current tab's transcript and name, the syntax theme, and quitting. For creating tabs see [Agents](/user-documentation/getting-started/agents); for opening files and pages see [Opening files and pages](/user-documentation/tab-types/opening-files).

| Command | What it does |
|---|---|
| `agent [launch options] execute <task> [parameters...]` | Run a task autonomously in a new local ACP session; see [Autonomous task execution](/user-documentation/advanced-agents/agent-command) |
| `help [<command>]` | List available commands, or show one command's usage, use cases, and examples |
| `help keys` | List every key binding |
| `layout` | `layout window <width> <height>`, `layout sidebar left\|right <width>`, `layout split <percent>`, or `layout reporting <percent>` sets a size; `layout show` prints the current ones |
| `diff [path]` | Open the [diff tab](/user-documentation/tab-types/diff-tab) on the project's changes, optionally scoped to a directory |
| `newfile <file>` | Open a new unsaved text file; see [Creating a file or directory](/user-documentation/tab-types/opening-files#create-a-file-or-directory) |
| `newdir <directory>` | Create a directory immediately under an existing parent; see [Creating a file or directory](/user-documentation/tab-types/opening-files#create-a-file-or-directory) |
| `open [external] [page] <target>` | Open a file, a web page, or an external application; see [Opening files and pages](/user-documentation/tab-types/opening-files) |
| `edit <file>[:line]` | Open a file for editing; a bare existing runscript name opens that script when no exact file exists; see [Opening files](/user-documentation/tab-types/opening-files#opening-a-file-to-change-it-edit) |
| `execute <name>` | Run an existing project runscript immediately in the system shell; see [Scheduling](/user-documentation/automation/scheduling#run-a-runscript-now) |
| `scripts` | Open a list of the project's runscripts. Use a row's buttons to run, duplicate, or delete one, or **+** to create one. |
| `clear` | Empty the current tab's transcript — other tabs are unaffected. In a shell tab, `clear` clears the terminal; use `/clear` to empty the transcript |
| `rename [newname]` | Set (or, bare, clear) the tab's display alias — see [Tabs](/user-documentation/getting-started/tabs) |
| `tab` | `focus <name>`, `move <tab> <position>`, `pane <tab> left\|right`, `split <tab>`, `color <tab> <#rrggbb>`, `group <tab> <id\|name>`, `dock <tab> left\|right`, `undock <tab>` arrange tabs |
| `theme [name]` | Switch the application color theme; bare form opens a picker |
| `syntax theme [name]` | Switch the editor and diff syntax theme; bare form opens a picker |
| `notifications [left\|right]` | Open the [notifications](/user-documentation/tab-types/notifications) feed, optionally docked in a sidebar |
| `notifications clear` | Empty the notifications queue, record file, and any toasts on screen |
| `notify <message>` | Push a custom line into the [notifications](/user-documentation/tab-types/notifications) feed |
| `plugins` | List the [bundled tab plugins](/user-documentation/command-bar/plugins) with their version and state |
| `conversation <title>` | Open a saved conversation by title, or start a new conversation and send `<title>` as the first query |
| `conversations [left\|right\|<title>]` | Open or dock the [conversation list](/user-documentation/tab-types/conversations), or reopen a saved conversation by its title |
| `shell [name] [-w\|--workspace\|--no-workspace] [--offline]` | Open a separate [shell tab](/user-documentation/command-bar/shell#open-a-shell-tab), in a fresh sandboxed workspace clone unless `--no-workspace` is given |
| `quit` / `/quit` | Exit the application, after confirmation |

## `edit` and `execute` runscripts

Create a runscript in `.janissary/scripts/<name>.rs`, then run it immediately with `execute <name>`. Its commands run in the project shell, including when you type `execute` from a workspaced shell. The runscript name uses lowercase letters and digits, with single hyphens between words. A missing runscript prints `No runscript named "<name>".`.

Use `edit <name>` to open an existing runscript. If a file with that exact name already exists at the path your working directory resolves to, Janissary opens that file instead. Other paths such as `edit notes/new-idea.md` keep the usual editor behavior.

Type `scripts` to open the **scripts** tab, where each row has **Run**, **Duplicate**, and **Delete** buttons, and a double-click opens that runscript in an editor tab.

## `help`

`help` lists every command with a one-line description. Type `help <command>` for that command's usage, use cases, and examples, or `help keys` to list the keyboard shortcuts.

For example, `help profile` shows profile commands and `help /quit` shows the quit command page. Names are case-insensitive and one leading slash is ignored. A name without a help page gets `No help for "<name>". Type "help" for available commands.`

If the help files can't be read, `help` falls back to a single summary line naming the built-in commands and reminding you that `!` runs something in the shell, `/` runs a built-in, and `Ctrl+R` or `hist` opens command history.

Every command's page is also on this site, under **Command Reference** in the sidebar.

## `tab`

Every `tab` form finds the first tab whose label or display alias matches, ignoring case. Quote a name that contains spaces. Successful arrangement commands print nothing and leave focus unchanged, except docking the active tab, which moves focus to a center tab:

```
tab focus bilal
tab focus "review notes"
tab move "review notes" 2
tab pane janus right
tab split "review notes"
tab color "review notes" #FF8800
tab group "review notes" scratch
tab dock "review notes" left
tab undock "review notes"
```

`tab move` uses a 1-based position. A center tab moves among center tabs in its group and pane. A visible docked tab moves among every tab on its sidebar, regardless of group, while a hidden docked tab keeps its center group-and-pane order. Reporting tabs move among other reporting tabs. A position past the end moves the tab to the last place.

`tab group` joins or creates a group and inserts the tab after its last member. `tab color` changes the dot, not the group's band. `tab dock` docks file navigators, notifications, or bundled-plugin tabs; docking the active tab moves focus to a center tab. `tab undock` returns a docked tab without taking focus. `tab focus` reveals a hidden managed system tab. The exact alias `system` is reserved; trying to use it prints `Cannot use "system": that name is reserved for the system tab.`

If no tab matches, the app prints `No tab named "<name>".` An unsupported dock, a monitor group request, a pane move for an ineligible tab, or undocking a hidden tab sends one notification and leaves the transcript alone:

```
Cannot dock "<name>".
Cannot group "<name>".
Cannot move "<name>" to a pane.
Cannot undock "<name>".
```

Malformed forms print the matching usage line: `Usage: tab focus <name>.`, `Usage: tab move <tab> <position>.`, `Usage: tab pane <tab> left|right.`, `Usage: tab split <tab>.`, `Usage: tab color <tab> <#rrggbb>.`, `Usage: tab group <tab> <id|name>.`, `Usage: tab dock <tab> left|right.`, or `Usage: tab undock <tab>.` Bare `tab` and unknown subcommands print `Usage: tab focus|move|pane|split|color|group|dock|undock <tab> [argument].`

## `theme`

`theme <name>` sets the application's color theme — the tab strip, transcript colors, panels, borders, pickers, dialogs, and editor chrome — and applies it immediately, with no restart. It persists to the `theme` key in [app configuration](/user-documentation/getting-started/configuration), so it survives a restart. Names match case-insensitively. An unrecognized name shows an error listing the six built-in themes: `dark` (the default), `light`, `solarized-dark`, `solarized-light`, `nord`, and `dracula`. There are no custom themes.

Bare `theme` opens a picker overlay listing every theme, each row showing a swatch of that theme's own colors next to its name, with the active theme marked. `↑`/`↓` move the selection, `Return` applies it, `Escape` closes, and a row can be clicked.

`theme sync` sets the syntax-highlighting theme to the app theme's name, when a syntax theme with exactly that name exists — otherwise it reports that no matching syntax theme exists and leaves the syntax theme unchanged. The application theme and the syntax theme are independent settings; nothing keeps them in sync automatically, so `theme sync` is the only bridge between them. Today only `nord` exists in both name sets, so sync usually reports no match.

Both `theme <name>` and `syntax theme <name>` have to write the choice into `.janissary/config.json` before they apply it. A write that fails leaves the setting exactly as it was, and the reply says so:

```
Could not save theme "light" to .janissary/config.json — theme unchanged.
```

`syntax theme <name>` and `theme sync` answer the same way for the syntax theme. Check that the file and its `.janissary` folder are writable, then run the command again.

The theme applies to the whole window — there is no per-tab or per-workspace theming. Rendered Markdown documents follow the active theme too. Embedded web pages and ANSI-colored shell output are deliberately outside the theme — a web page keeps its own paper-white background whatever you pick, and shell output keeps the standard 16 terminal colors — and so are tab dot colors, which are assigned per tab to tell tabs apart rather than drawn from the theme; status indicators such as the running-command highlight, editor saved/error notices, and search-hit highlighting are theme-driven.

**Terminals are the other thing that stays outside it.** A [harness](/user-documentation/advanced-agents/harness) tab, a zsh shell, and an [ssh](/user-documentation/advanced-agents/harness#ssh-sessions) session keep the same dark background and light text in all six themes, because a terminal's own palette is the terminal's. Pick `light` and open a harness and the pane stays dark; that is the boundary working, not the theme failing. The one part that does follow the theme is the highlight over text you have selected in a harness terminal, so it stays visible against the terminal's own colors.

## `syntax theme`

<img class="agent-float left" src="/agents/orhan-south-east.png" alt="" />

`syntax theme <name>` sets the syntax-highlighting theme used by every open [editor tab](/user-documentation/tab-types/editor) and diff tab, and persists it so it survives a restart. Names match case-insensitively. An unrecognized name shows an error listing the available themes — which is also a quick way to see what's on offer. Bare `syntax theme` opens a picker overlay instead: arrows move, `Return` picks, `Escape` closes. Any other `syntax` subcommand prints `Usage: syntax theme [name]`. See [app configuration](/user-documentation/getting-started/configuration) for the setting and its default.

A picker needs a screen, so a command that arrives from somewhere without one answers with the list instead of opening anything. Another agent running `syntax theme`, or a [schedule](/user-documentation/automation/scheduling) firing it, gets the available themes printed with the active one marked `*`. The same is true of bare `theme`.

## `quit` and the confirmation dialog

<img class="agent-float" src="/agents/selim-south.png" alt="" />

Typed by you, `quit` (or `/quit`) is the only command that exits the whole app, and it always asks first: a dialog reading "Are you sure you want to quit?" with **Quit (y)** and **Cancel (n)** buttons. **Cancel** is selected by default, so a stray `Enter` is safe. Press `y` to confirm or `n` / `Escape` to cancel; `←`/`→` move the selection. While the dialog is open it traps all other input — clicks outside it and other keys do nothing.

A `quit` nobody typed is not asked about. A [schedule](/user-documentation/automation/scheduling) that fires a `quit`, or another tab telling this one to `quit`, exits the app outright, with no dialog and no unsaved-changes guard.

Don't reach for `exit` to leave the app: `exit` is an alias of `close` and closes the current *tab*. The one overlap is the last tab — closing it exits the app, so `close`, `exit`, the tab strip's × and `Cmd+W`/`Ctrl+W` all show the same confirmation dialog there (see [Tabs](/user-documentation/getting-started/tabs)).

### Quitting with unsaved work

If any tab has unsaved changes when you quit, you get a different dialog instead: "You have unsaved changes. Close anyway?" with **Close anyway (y)** and **Cancel (n)**. It answers to the same keys as the ordinary quit dialog, with **Cancel** selected by default.

Confirming quits straight away and throws those edits away. There's no per-file save prompt on this path, so save what you want to keep before you confirm. Cancelling leaves every tab open with its edits intact.

Unsaved work means an [editor tab](/user-documentation/tab-types/editor) holding a buffer you haven't written, or an [image tab](/user-documentation/tab-types/image-viewer) holding edits you haven't saved. Both raise this dialog. This is a different thing from the save prompt you get when closing one tab while others remain — that one offers to save the file first.

Closing the browser window or reloading the page while work is unsaved gets you the browser's own "leave site?" prompt, which is the one close path the app can't put a dialog in front of.

## `notifications` and `notify`


`notifications` opens a single feed tab for background activity: an agent finishing, a message arriving, a scheduled command firing, an agent starting a turn, or a model query being rate limited. Background event toggles in `.janissary/config.json` default off; rate-limit reports use `notifications.events.rateLimited`. `notifications left` or `notifications right` docks the feed into a sidebar, and `notifications clear` empties the queue, the record file, and any toasts on screen. `notify <message>` and diagnostic messages bypass event toggles and focus suppression. A notification with no feed on screen appears as a toast instead, escalating to a docked feed after three within ten seconds. See [Notifications](/user-documentation/tab-types/notifications) for delivery details and [app configuration](/user-documentation/getting-started/configuration) for the settings.

## Command comments

Anything between `##` markers is stripped from a command before it runs or is saved to history:

```
git status ## check before the demo ##
## just cleaning up ## clear
```

Both run normally with the comment removed, and the gap a comment leaves behind closes up to a single space, so `clear ## note` and `## note ## clear` both run exactly `clear`. A `##` with no closing marker comments out the rest of the line. What is saved to your history is the command with the comments gone, so recalling it later gives you the bare version.

An empty command does nothing at all. A line holding only a comment, and any line holding only spaces, is discarded: nothing is added to the transcript and nothing is added to your history, so pressing `Enter` on a blank command bar is simply ignored rather than logged as an empty entry.

You'll also see the app use this itself: commands fired by the [scheduler](/user-documentation/automation/scheduling) appear in the transcript as `<command> ## scheduled ##`.
