## Application Commands

### Native command settings

Application commands use `~/.janissary/commands.json`, with a project-level `.janissary/commands.json` replacing the home file when it is valid. Each file is an object keyed by command name; each value may contain boolean `enabled` and `agentAccess` fields. Missing commands and missing fields default to `true`. Names are trimmed, case-insensitive, and have repeated whitespace collapsed. If keys normalize to the same name, the last key in the file supplies both values. Unknown names do not affect command settings and are removed when the file is next saved.

Each named fixed subcommand form of a built-in command, such as `tab dock`, `files expand`, `layout window`, `notifications clear`, `schedule cancel`, `open external`, and `db sqlite`, has its own row whose name is the full form and whose parent is the command. Disabling one form leaves the command's other forms enabled, while disabling the parent command disables every form. The `ask reset`, `tell reset`, and `search transcript` rows keep sharing their command's name.

The command inventory lists a bundled plugin's command and aliases only when the host accepted those claims. A plugin whose command or alias claims a name already reserved by a built-in command, or already claimed by another plugin, contributes no row and no alias for that claim, even though the built-in keeps the name.

Malformed entries default both values to `true` and remain visible with other valid settings from the same file. They do not make the file unusable or prevent edits; a successful save writes the settings and removes malformed entries. Invalid JSON or a top-level value that is not an object makes the file unusable and falls back from the project file to the home file, then to enabled defaults. Damaged files are left untouched. A fallback reports `commands.json <problem> at <path> — showing the <home|project> commands file.`, and that report stays in the published settings after a successful edit while the damaged file is still ignored; defaults after a damaged file report `commands.json <problem> at <path> — showing default commands.` An edit is refused only when no usable settings file is available, with `commands.json at <path> is unusable — fix the file before editing commands.`

Reading defaults does not create a file. The first edit writes the home file; edits to a valid project override update that project file. Settings are re-read at initialization, when the Commands tab opens, and before every edit. Writes replace the file atomically; settings become effective and are published only after a successful write, and a successful write publishes the new snapshot to open plugin views and re-broadcasts the client state snapshot so every connected client's disabled-command list matches the server's current settings. A failure reports `Could not write commands.json at <path>.` and leaves the current settings unchanged. A child command's effective availability also requires its declared parents to be enabled. Its saved values remain unchanged when a parent is disabled. Agent access applies only to native ACP commands; other commands have no agent-access restriction. For an ACP prompt, the role's grants are intersected with the current effective agent access to build the commands the agent is told it may use. Every granted tool owner keeps its group primer, and the allow-list line is omitted when no granted command remains available. A command that is disabled or denied agent access is still recognized and extractable, so it is refused as a tool result rather than becoming a final answer.

### `commands`

Bare `commands` opens the Commands tab and focuses it when it is already open. It re-reads the effective settings file before showing the tab. The command never docks the tab itself; the generic `tab dock` command can dock it like any bundled plugin tab. See [[commands-tab]].

`commands enable [agent|global] <command>` and `commands disable [agent|global] <command>` change one setting without opening or focusing the tab. The optional selector defaults to `global`; `agent` changes the command's agent access and `global` changes whether the command is enabled. The command name is matched exactly, ignoring case and repeated whitespace, against canonical names first, then aliases, then fixed forms, so a canonical name wins over another command's fixed form: `commands enable question ask` targets the native `question ask` command rather than the builtin `question` command. A selector is read only when another word follows it, so `commands disable agent` disables the `agent` command while `commands disable agent agent` is parsed as an agent-access change for `agent` and is then refused with `Not a native ACP command: agent.` because `agent` is not a native ACP command. Trailing words are never ignored, and the same exact matching applies to any other caller that changes a setting by name: a name with trailing text is refused as `Unknown application command: <name>.` without changing a setting.

A malformed or missing form replies exactly `Usage: commands [enable|disable [agent|global] <command>].` An unmatched name replies exactly `Unknown application command: <command>.`, preserving the typed case. Changing agent access for a command that is not a native ACP command replies exactly `Not a native ACP command: <canonical>.` A successful change, including one that sets an already-saved value, is silent. An unusable settings file replies `commands.json at <path> is unusable — fix the file before editing commands.` and a failed write replies `Could not write commands.json at <path>.`

`commands` is an ordinary command setting, so it can disable itself. While its tab is open the tab can re-enable it; once the tab is closed, a disabled `commands` is refused at dispatch like any other command, and recovery requires editing the effective `commands.json` file by hand.

### Disabled command dispatch

A command whose effective setting is disabled is refused wherever the server dispatches it: from a tab's command bar, a plugin line or queue dispatch, a scheduled command, or a skill-granted agent command. The refusal is exactly `Command is disabled: <command>.`, where `<command>` is the canonical name of the matched row; a native child's row name is its full fixed form, and an alias reports its canonical command. The refusal applies only when the input matches a registered command or `help`; input that matches no command keeps the ordinary unknown-command reply even when it begins with a disabled command's name, so `quit now` is not refused as `quit`. The application claims the refusal, so a disabled command never falls through to another command owner or to the shell. Explicit `!` shell execution is not an application command and is not affected.

The command is refused before it has any effect. Settings are checked when a line is dispatched, not when it was queued or scheduled, so a line queued while enabled is refused if the command is disabled before it runs. A running invocation is not interrupted. The refusal is returned even when the originating tab is active or notification delivery is suppressed.

Client-side pickers and command-backed shortcuts honor the same effective availability, as presentation only. A command-bar line that resolves to a disabled command is offered to the server instead of opening its picker or theme dialog, so the ordinary refusal appears wherever the line was typed. A disabled `quit` or `close` line is consumed instead: no quit confirmation or save guard opens, and the client reports the canonical word (`quit` or `close`) to the server, which re-checks its current snapshot and emits the existing `command-disabled` notification as the line's only feedback. In a shell tab, the local `hist` history route and `search transcript` find route are skipped the same way; a line beginning with `!` and bare `clear` keep their shell routes. A shortcut whose command is disabled is blocked, and the client reports it to the server, which re-checks its current snapshot and emits the existing `command-disabled` notification. A client working from an older snapshot can at worst block an enabled shortcut, quit, or close with no notification, or open a picker whose line the server then refuses; it can never execute a disabled command.

A disabled command produces a `command-disabled` notification attributed to the tab where it was dispatched. The notification follows the usual ambient toggle and focus rules; it never changes the refusal.

An ACP agent command is checked again immediately before every emitted call. A command whose effective setting is disabled, or whose effective agent access is off, returns exactly `Command is disabled: <command>.` to the agent as a normal tool result, recorded as one tool step; the agent-access case also emits the same `command-disabled` notification. That check runs before the role-grant refusal, so a disabled command the role did not grant reports the disabled refusal. A missing settings manager or setting row allows the command. A command already executing is not interrupted; the next emitted command re-checks settings. Agent access never restricts human command-bar dispatch. Enabled, granted native calls go through the ordinary dispatcher, so browser, database, and question output and cancellation behave as they do from a command bar: browser and database results are returned to the agent without an interactive or appended duplicate, and a cancelled question returns `Question cancelled.`

`help` is subject to the same policy. While enabled it continues to list disabled commands. While disabled, both bare and named help return the canonical refusal instead of help text or an unknown-command reply.

### Disabled command completion

Tab completion omits a disabled command or fixed form from the first-word command candidates, including its aliases, and offers no argument or path completion under it. A disabled native child is omitted from its command's subcommand candidates while enabled siblings remain. Disabling a shared canonical name hides every owner and form of that name. A disabled name stays hidden even when a filesystem path with the same prefix remains. While `help` is enabled, its output and help-page completion still include disabled commands; when `help` is disabled, its command word and pages are suppressed like any other disabled command. Explicit `!` shell lines are not application commands and keep ordinary completion.

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

The `tab` command claims the entire `tab` token, including malformed forms. Each form that names a target resolves the first tab in the full tab array whose label or display alias matches, ignoring case; hidden tabs are included. A target with spaces must be quoted with single or double quotes. A multiword group name supplied to `tab group` must be quoted as one selector token. A quote may open in the middle of a token, and a backslash escapes the matching quote inside a quoted value. An empty quoted target is malformed. A missing target prints `No tab named "<name>".` to the command transcript.

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

Angle-bracket arguments in these usage replies are rendered as literal text, including when a shell tab displays them in its terminal.

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
