## Application Commands

### `help`

Returns the **Commands** and **Key Bindings** sections extracted from `README.md` (parsed and cached on first use). If the README cannot be read, it falls back to a generated summary listing the built-in commands and the `shell` / `/` prefixes and `Ctrl+R` history shortcut.

### `state`

Reads the agent state file for the current tab from `.janissary/state/<name>.json` and displays each field. Array and object values are JSON-formatted and truncated to the last 10 lines. If no state file exists for the current agent, a message is shown.

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `rename`

Sets the current tab's display alias — see `tabs.md` for how the alias behaves. `rename <newname>` sets it; bare `rename` clears it.

### `quit`

Exits the application: closes the app window (the web page) and stops the server, after killing every tab's shell, ACP session, browser, and terminals and closing all connections. Requires confirmation first — see `quit-confirmation.md`. (To close a single tab, use `close`; `exit` is an alias of `close`, not `quit`.)
