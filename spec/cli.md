# Command-line interface

`janus [options]` — a terminal UI shell with built-in commands and shell execution.

### Flags

| Flag | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `--port=<n>` | string (numeric) | auto | Port for the HTTP server to listen on. |
| `--no-open` | boolean | `false` | Start the server without opening the app window. |
| `--relaunch` | boolean | `false` | Preserve existing state instead of clearing it. See `spec/relaunch.md`. |
| `--help` | boolean | `false` | Print usage text to stdout and exit 0. |
| `--version` | boolean | `false` | Print the application name and version to stdout and exit 0. |

### `--help`

Prints the usage summary to stdout and exits immediately with code 0. No side effects: the `.janissary/` directory is not created, no state is cleared, no server is started, and no browser window is opened.

### `--version`

Prints `<name> <version>` (read from `package.json` at runtime) to stdout and exits immediately with code 0. No side effects, same as `--help`.

### Startup sequence

When neither `--help` nor `--version` is given, `janus` boots the full application:

1. Initialize `.janissary/` subdirectories (agent state, database, profiles, workspace).
2. Start the transcript logger and transcript store.
3. Load application config from `.janissary/config.json`.
4. Unless `--relaunch`: clear the state directory, transcript store, and workspace directory.
5. Start the HTTP server (on the requested port, or an ephemeral port if none given).
6. Print the server URL to stdout (`__JANUS_URL__ <url>`) and stderr (human-readable).
7. Unless `--no-open`: open the app in a Chrome app window (or the default browser if no system Chrome is found).
8. Register signal handlers for graceful shutdown (SIGINT, SIGTERM) and app window cleanup on exit.
