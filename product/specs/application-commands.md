## Application Commands

### `help`

Returns the contents of `help.md` at the repo root (read and cached on first use). Its command table lists the commands in alphabetical order by name. If that file cannot be read, it falls back to a generated summary listing the built-in commands and the `shell` / `/` prefixes and `Ctrl+R` history shortcut.

`help <section>` returns one section of that text instead of all of it. The sections are the help text's own headings, **Commands** and **Key Bindings**, and the labelled key tables inside Key Bindings, such as **Global key bindings** or **Shell tab controls**. A heading's section runs to the next heading; a key table's section is its label line and the table under it. The name is matched without regard to case or extra spaces: a title equal to it wins, then a title that starts with it, then a title containing it as whole words, and among several candidates the earliest in the help text is chosen. So `help commands` prints the command table, `help shell` the shell tab's keys, and `help agent` the command bar and agent tab controls. A name that matches nothing answers `No help section matches "<name>". Sections: <every section title>.` A section reply is rendered as markdown like the full text, and from a shell tab's command bar it is answered by the application rather than sent to zsh. When `help.md` cannot be read, `help <section>` returns the same generated summary as bare `help`.

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `rename`

Sets the current tab's display alias — see `tabs.md` for how the alias behaves. `rename <newname>` sets it; bare `rename` clears it.

### `syntax`

`syntax theme <name>` sets the active syntax-highlighting theme for editor tabs; the theme applies globally, across every open editor tab, and persists to the application config so it survives a restart. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. If the config file cannot be written, the syntax theme stays as it was and the reply says it could not be saved and is unchanged. Bare `syntax theme` opens a theme-picker overlay instead of running on the server; if it does reach the server directly (e.g. from another agent), it replies with the theme list, the active one marked. Any other `syntax` subcommand shows usage.

### `theme`

`theme <name>` sets the active application color theme for the whole window chrome; it applies immediately without restart and persists to the application config. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. If the config file cannot be written, the theme stays as it was and the reply says it could not be saved and is unchanged. Bare `theme` opens a theme-picker overlay with per-theme color swatches instead of running on the server; if it does reach the server directly (e.g. from another agent), it replies with the theme list, the active one marked. `theme sync` sets the syntax theme to match the app theme when a syntax theme with the same name exists, and reports that none exists otherwise. See `application-themes.md`.

### `tasks`

Bare `tasks` opens the task-picker overlay instead of running on the server — a client-side
listing of the executable `ai/*.md` task files (see `task-picker.md`). If it does reach the server
directly (e.g. from a scheduled dispatch or another agent), it is a no-op.

### `notifications`

`notifications` opens the singleton notifications tab, or focuses it when already open (undocking it back to center and making it active if it was docked). `notifications left` / `notifications right` dock it into that sidebar instead. `notifications clear` empties the notification queue, the record file, and any toasts on screen, and opens nothing. See `notifications.md` for the tab, its events, and the config model.

### `notify`

`notify <message>` pushes a custom line into the notifications feed, attributed to the issuing tab. It bypasses focus suppression and the per-event toggles, and — like every recorded event — is held in the notification queue and shown as a toast when no feed is on screen, so the message always lands somewhere. Bare `notify` (no message) is a usage error (`Usage: notify <message>.`). Available from any tab, agents included. See `notifications.md`.

### `quit`

Exits the application: closes the app window (the web page) and stops the server after killing all shells, ACP and editor-suggestion sessions, browsers, terminals, and monitors; stopping schedules and file watchers; cancelling pending questions; closing harness recordings and transcripts; closing database connections; and removing disposable workspaces. Requires confirmation first — see `quit-confirmation.md`. (To close a single tab, use `close`; `exit` is an alias of `close`, not `quit`.)
