## Application Commands

### Structured command replies

When a command is dispatched from a plugin tab, the reply preserves `dispatched`, `output`, and `coreResponse` and may also include the command's structured `result`. A structured command's reply carries the output it appended during its invocation together with its `result`, and the reply is complete once the command finishes, however long that takes. Commands that return no result keep the existing printed-output reply; only output produced by that invocation is included, and capture stops after 30 seconds while later output remains in the transcript.

### `help`

Bare `help` and `help commands` print `help/commands.md`, the command table. The table is alphabetical by command name and each description is limited to 200 characters. `help keys` prints the key-binding reference from `help/keys.md`; key bindings are not included in bare `help`.

`help <command>` prints the matching page from `help/<command>.md`, which describes its usage, use cases, and examples. Page names include `commands`, `keys`, and the first word of each command-table entry, so `help tab` prints the page for `tab focus <name>`. Names are case-insensitive; surrounding and repeated spaces are ignored, and one leading slash is dropped, so `help /quit` prints the `quit` page. Only an exact listed page name is accepted. A missing page returns exactly `No help for "<name>". Type "help" for available commands.`, where `<name>` is lowercased, whitespace-collapsed, trimmed, and has one leading slash removed. Thus `help //quit` reports `No help for "/quit". Type "help" for available commands.` and `help tab focus` reports a missing page rather than selecting `tab`.

The documentation site's **Command Reference** sidebar shows each page name as code text. HTML characters in a name display literally, and the link retains that page's original route.

The `help schedule` page documents tab and project-owned schedule creation, tab targeting, and the list, cancel, and clear forms for both schedule owners.

The `help db` page lists `db sqlite list`, `db sqlite create <name>`, `db sqlite delete <name>`, and `db sqlite query <name> <sql>` as supported forms; its examples use the same `sqlite` engine token.

The page name must be present in the `help/` directory listing; a query such as `../package` or `a/b` cannot read outside it. Help pages are read when requested and are not cached. The required `commands.md` index must be readable for every page request, even when the requested page itself is readable. If the directory or index cannot be read, or the requested page cannot be read, `help` returns the generated summary listing built-in commands and the `!` / `/` prefixes and `Ctrl+R` history shortcut. Every reply is rendered as markdown, and from a shell tab's command bar it is answered by the application rather than sent to zsh. `helper` remains an unknown command.

### `execute`

`execute <name>` reads the current project runscript and appends its parsed lines as one contiguous batch to the managed system shell queue. The managed system shell is ensured before the batch is appended. Success is silent, and commands run through the ordinary shell/application dispatcher from the project shell. An empty runscript succeeds without queue rows. A malformed or invalid name returns exactly `Usage: execute <name>`. A missing script returns exactly `No runscript named "<name>".`; an existing unsafe or unreadable script returns `Could not read runscript "<name>".`. A failed shell start adds no rows and uses the system-shell start failure notice. Manual rows have no schedule provenance or schedule notice. See [[scheduling]] and [[command-queue]].

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `rename`

Sets the current tab's display alias — see `tabs.md` for how the alias behaves. `rename <newname>` sets it; bare `rename` clears it. The normalized exact name `system` is reserved, case-insensitively, and returns `Cannot use "system": that name is reserved for the system tab.` without changing the alias or an editor file. A managed system tab can clear its alias back to its canonical label.

### `tab focus`

`tab focus <name>` explicitly focuses the first tab whose label or display alias matches `<name>`, ignoring case. Everything after `focus` is treated as the name, so names may contain spaces. Success prints nothing. A missing name returns `No tab named "<name>".` Bare `tab`, bare `tab focus`, and any unsupported subcommand return `Usage: tab focus <name>.` Explicit focus reveals a hidden system tab and undocks it if necessary. The command claims the entire `tab` token, including malformed forms.

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
