## Application Commands

### `help`

Returns the contents of `help.md` at the repo root (read and cached on first use). If that file cannot be read, it falls back to a generated summary listing the built-in commands and the `shell` / `/` prefixes and `Ctrl+R` history shortcut.

### `state`

Reads the agent state file for the current tab from `.janissary/state/<name>.json` and displays each field. Array and object values are JSON-formatted and truncated to the last 10 lines. If no state file exists for the current agent, a message is shown.

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `rename`

Sets the current tab's display alias — see `tabs.md` for how the alias behaves. `rename <newname>` sets it; bare `rename` clears it.

### `syntax`

`syntax theme <name>` sets the active syntax-highlighting theme for editor tabs; the theme applies globally, across every open editor tab, and persists to the application config so it survives a restart. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. Bare `syntax theme` opens a theme-picker overlay instead of running on the server; if it does reach the server directly (e.g. from another agent), it replies with the theme list, the active one marked. Any other `syntax` subcommand shows usage.

### `theme`

`theme <name>` sets the active application color theme for the whole window chrome; it applies immediately without restart and persists to the application config. Theme names are matched case-insensitively and canonicalized to their listed casing. An unrecognized name shows an error listing the available themes. Bare `theme` opens a theme-picker overlay with per-theme color swatches instead of running on the server; if it does reach the server directly (e.g. from another agent), it replies with the theme list, the active one marked. `theme sync` sets the syntax theme to match the app theme when a syntax theme with the same name exists, and reports that none exists otherwise. See `application-themes.md`.

### `tasks`

Bare `tasks` opens the task-picker overlay instead of running on the server — a client-side
listing of the executable `ai/*.md` task files (see `task-picker.md`). If it does reach the server
directly (e.g. from a scheduled dispatch or another agent), it is a no-op.

### `notifications`

`notifications` opens the singleton notifications tab, or focuses it when already open (undocking it back to center and making it active if it was docked). `notifications left` / `notifications right` dock it into that sidebar instead. See `notifications.md` for the tab, its events, and the config model.

### `notify`

`notify <message>` pushes a custom line into the notifications feed, attributed to the issuing tab. It bypasses focus suppression and the per-event toggles but obeys the drop-if-closed rule: if the notifications tab is not open, the message is dropped and nothing is recorded in the feed. Bare `notify` (no message) is a usage error (`Usage: notify <message>.`). Available from any tab, agents included. See `notifications.md`.

### `quit`

Exits the application: closes the app window (the web page) and stops the server, after killing every tab's shell, ACP session, browser, and terminals and closing all connections. Requires confirmation first — see `quit-confirmation.md`. (To close a single tab, use `close`; `exit` is an alias of `close`, not `quit`.)
