## Application Commands

### Structured command replies

When a command is dispatched from a plugin tab, the reply preserves `dispatched`, `output`, and `coreResponse` and may also include the command's structured `result`. A structured command's reply carries the output it appended during its invocation together with its `result`, and the reply is complete once the command finishes, however long that takes. Commands that return no result keep the existing printed-output reply; only output produced by that invocation is included, and capture stops after 30 seconds while later output remains in the transcript.

### `help`

Bare `help` and `help commands` print the alphabetical command table, whose descriptions are limited to 200 characters except for the `files` row, which is limited to 350 characters to fit its expanded syntax. A command description may include a shortcut reference, such as `Ctrl+E` in the `queue` row. The separate `Key Bindings` section appears only in `help keys` and is not included in bare `help`.

The `files` row keeps the `name`, `size`, `modified`, and `permissions` detail modes together in its single description cell. It also names the `expand <path>`, `collapse <path>`, `cursor <path>`, `anchor <path>`, and `select <path>` view clauses and notes that labels with spaces or quotes should be quoted.

Each command page uses one opening description after its `### <command>` heading, followed by **Usage**, **Use cases**, and **Examples** blocks in that order.

`help <command>` prints the matching page from `help/<command>.md`, which describes its usage, use cases, and examples. Page names include `commands`, `keys`, and the first word of each command-table entry, so `help tab` prints the page for the `tab` command. Names are case-insensitive; surrounding and repeated spaces are ignored, and one leading slash is dropped, so `help /quit` prints the `quit` page. Only an exact listed page name is accepted. A missing page returns exactly `No help for "<name>". Type "help" for available commands.`, where `<name>` is lowercased, whitespace-collapsed, trimmed, and has one leading slash removed. Thus `help //quit` reports `No help for "/quit". Type "help" for available commands.` and `help tab focus` reports a missing page rather than selecting `tab`.

The documentation site's **Command Reference** sidebar and generated page heading show each page name as code text. Markdown delimiters and HTML characters in a name display literally rather than changing the page markup, and the sidebar link retains that page's original route.

The `help schedule` page documents tab and project-owned schedule creation, tab targeting, and the list, cancel, and clear forms for both schedule owners.

The `help db` page lists `db sqlite list`, `db sqlite create <name>`, `db sqlite delete <name>`, and `db sqlite query <name> <sql>` as supported forms; its examples use the same `sqlite` engine token.

The page name must be present in the `help/` directory listing; a query such as `../package` or `a/b` cannot read outside it. Only regular Markdown files inside the help directory are served or published. Symbolic links are never served or published, including links to files elsewhere on disk. Help pages are read when requested and are not cached. The required `commands.md` index must be readable for every page request, even when the requested page itself is readable. If the directory or index cannot be read, or the requested page cannot be read, `help` returns the generated summary listing built-in commands and the `!` / `/` prefixes and `Ctrl+R` history shortcut. Every reply is rendered as markdown, and from a shell tab's command bar it is answered by the application rather than sent to zsh. `helper` remains an unknown command.

### `execute`

`execute <name>` reads the current project runscript and appends its parsed lines as one contiguous batch to the managed system shell queue. The managed system shell is ensured before the batch is appended. Success is silent, and commands run through the ordinary shell/application dispatcher from the project shell. An empty runscript succeeds without queue rows. A malformed or invalid name returns exactly `Usage: execute <name>`. A missing script returns exactly `No runscript named "<name>".`; an existing unsafe or unreadable script returns `Could not read runscript "<name>".`. A failed shell start adds no rows and uses the system-shell start failure notice. Manual rows have no schedule provenance or schedule notice. See [[scheduling]] and [[command-queue]].

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `rename`

Sets the current tab's display alias — see `tabs.md` for how the alias behaves. `rename <newname>` sets it; bare `rename` clears it. The normalized exact name `system` is reserved, case-insensitively, and returns `Cannot use "system": that name is reserved for the system tab.` without changing the alias or an editor file. A managed system tab can clear its alias back to its canonical label.

### `tab`

The `tab` command claims the entire `tab` token, including malformed forms. Each form that names a target resolves the first tab in the full tab array whose label or display alias matches, ignoring case; hidden tabs are included. A target with spaces must be quoted with single or double quotes. A quote may open in the middle of a token, and a backslash escapes the matching quote inside a quoted value. An empty quoted target is malformed. A missing target prints `No tab named "<name>".` to the command transcript.

`tab focus <name>` focuses the target and reveals a hidden system tab, including undocking it if needed. `tab move <tab> <position>` moves the target to a 1-based position among its strip mates: a hidden tab uses itself and the center tabs in its group and pane, even when docked; a visible center tab uses the other center tabs in its group and pane; a visible docked tab uses all tabs on the same sidebar regardless of group; and a reporting tab uses the other reporting tabs. A position past the end moves it last. A hidden system tab stays hidden while it is moved. `tab pane <tab> left|right` moves the target to the named pane, opening or collapsing a split as required. `tab split <tab>` moves it to the other pane. Pane and split selection preserves the active tab unless the target itself was active; a moved tab becomes visible in the new pane unless that pane contains the active tab, and the other pane restores its prior visible tab or its most recently focused remaining tab. A split that loses its last tab collapses, and a tab shown as the secondary selection has its unread badge cleared.

`tab color <tab> <#rrggbb>` sets the dot to the six-digit color exactly as typed and leaves the group's fixed band color unchanged. `tab group <tab> <id|name>` moves the target into an existing group or creates the selected unknown name or positive ID. A new group name receives the next available ID; an unknown numeric ID is named `group-<id>`. The tab is inserted after the last member of its new group, keeps its pane and dock placement, and retains its dot color. A group left empty disappears. A monitor reporting tab cannot be grouped, but it can be moved among reporting tabs and recolored.

`tab dock <tab> left|right` docks a file-navigator tab, notifications tab, or bundled-plugin tab. Docking into an occupied side displaces only an existing tab of the same kind. A kind that cannot dock, or docking the only visible center tab, is refused. Docking the active tab moves focus to the nearest center tab to maintain the active-tab invariant. `tab undock <tab>` returns a visible docked tab to the currently focused pane without making it active. When there is no center tab to select, repairing the selection activates the undocked tab. Hidden tabs cannot be moved to a pane, split, or undocked; they can be moved, recolored, regrouped, or docked without being revealed. Arranging a tab otherwise does not change focus.

Successful arrangements and already-completed requests print nothing. An already-completed request emits no state update. Refusals write nothing to the transcript and send one explicit `tab` notification attributed to the tab where the command ran:

- `Cannot dock "<name>".` when the target kind cannot dock or it is the last visible center tab.
- `Cannot group "<name>".` for a monitor reporting tab.
- `Cannot move "<name>" to a pane.` for a tab ineligible for splitting or when an unsplit strip has fewer than two eligible tabs.
- `Cannot undock "<name>".` for a hidden tab.

A malformed known subcommand prints its own usage line:

```
Usage: tab focus <name>.
Usage: tab move <tab> <position>.
Usage: tab pane <tab> left|right.
Usage: tab split <tab>.
Usage: tab color <tab> <#rrggbb>.
Usage: tab group <tab> <id|name>.
Usage: tab dock <tab> left|right.
Usage: tab undock <tab>.
```

Bare `tab` and an unknown subcommand print `Usage: tab focus|move|pane|split|color|group|dock|undock <tab> [argument].` A missing or extra word, unterminated quote, empty quoted name, invalid side, non-positive or unsafe move position, color other than `#` plus six hexadecimal digits, or invalid group selector is malformed. A `tab focus` name with spaces must be quoted; `tab focus review notes` therefore prints `Usage: tab focus <name>.` See [[tabs]], [[sidebars]], and [[notifications]].

### `layout`

`layout window <width> <height>` sets the application window size in positive whole-number pixels. When no application window is open, it does nothing silently. A failed resize is reported only in notifications as `Could not resize the window: <reason>.`, where the reason is the error's first line with terminal punctuation removed and one period added.

The command is available from a command bar, runscript, or scheduled command. The command name, subcommands, and sidebar side are case-insensitive. Pixel dimensions must be positive safe whole numbers. `layout sidebar left|right <width>` sets either sidebar's width, even while that sidebar is hidden. `layout split <percent>` sets the left pane's share of the center area from 1 through 99, and only works while a center split is showing; otherwise it prints `No split is showing.` `layout reporting <percent>` sets the lower reporting area's share from 0 through 100. Percentage values must be whole numbers. These forms apply sizes as given without the drag controls' limits or checking screen bounds. Each successful form prints nothing. Updates reach every connected client; with no client connected they are dropped.

`layout show` prints the current sizes as re-runnable commands, in this order: window, left sidebar, right sidebar, split, reporting area. It rounds each size to the nearest whole number. The window line is omitted when no window is open, and the split line is omitted when no split is showing. Sidebar and reporting lines are included when a client has reported its layout. If reading window bounds fails, `Could not read the window size: <reason>.` is sent to notifications and the other lines still print. If there is nothing to print, `No layout to show.` is sent to notifications. Bare `layout`, an unknown subcommand, an invalid number or side, or any missing or extra word returns exactly `Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.` The shell command bar displays the usage placeholders literally.

Tab completes the five subcommands and completes `left` or `right` after `layout sidebar`; other argument positions use the ordinary file-path completion.

### `syntax`

`syntax theme <name>` sets the active syntax-highlighting theme for editor tabs; the theme applies globally, across every open editor tab, and persists to the application config so it survives a restart. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. If the config file cannot be written, the syntax theme stays as it was and the reply says it could not be saved and is unchanged. Bare `syntax theme` opens a theme-picker overlay instead of running on the server; if it does reach the server directly (e.g. from a scheduled dispatch), it replies with the theme list, the active one marked. Any other `syntax` subcommand shows usage.

### `theme`

`theme <name>` sets the active application color theme for the whole window chrome; it applies immediately without restart and persists to the application config. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. If the config file cannot be written, the theme stays as it was and the reply says it could not be saved and is unchanged. Bare `theme` opens a theme-picker overlay with per-theme color swatches instead of running on the server; if it does reach the server directly (e.g. from a scheduled dispatch), it replies with the theme list, the active one marked. `theme sync` sets the syntax theme to match the app theme when a syntax theme with the same name exists, and reports that none exists otherwise. See `application-themes.md`.

### `tasks`

Bare `tasks` opens the task-picker overlay instead of running on the server — a client-side
listing of the executable `ai/*.md` task files (see `task-picker.md`). If it does reach the server
directly (e.g. from a scheduled dispatch or a `send` into another tab), it is a no-op.

### `notifications`

`notifications` opens the singleton notifications tab, or focuses it when already open (undocking it back to center and making it active if it was docked). `notifications left` / `notifications right` dock it into that sidebar instead. `notifications clear` empties the notification queue, the record file, and any toasts on screen, and opens nothing. See `notifications.md` for the tab, its events, and the config model.

### `notify`

`notify <message>` pushes a custom line into the notifications feed, attributed to the issuing tab. It bypasses focus suppression and the per-event toggles, and — like every recorded event — is held in the notification queue and shown as a toast when no feed is on screen, so the message always lands somewhere. Bare `notify` (no message) is a usage error (`Usage: notify <message>.`). Available from any tab with a command bar, shell and harness tabs included. See `notifications.md`.

### `quit`

Exits the application: closes the app window (the web page) and stops the server after killing all shells, ACP and editor-suggestion sessions, browsers, terminals, and monitors; stopping schedules and file watchers; cancelling pending questions; closing harness recordings and transcripts; closing database connections; and removing disposable workspaces. Requires confirmation first — see `quit-confirmation.md`. (To close a single tab, use `close`; `exit` is an alias of `close`, not `quit`.)
