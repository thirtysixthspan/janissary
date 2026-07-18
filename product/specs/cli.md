# Command-line interface

`janus [options] [<project-dir>]` — a terminal UI shell with built-in commands and shell execution.

### Arguments

| Argument | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| `<project-dir>` | string (path) | current directory | Target project directory to work against. |

### Commands

| Command | Description |
| ------- | ----------- |
| `janus stop [<project-dir>]` | Stop the running instance for a directory. See "Stopping a running instance" below. |

### Flags

| Flag | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `--port=<n>` | string (numeric) | auto | Port for the HTTP server to listen on. |
| `--no-open` | boolean | `false` | Start the server without opening the app window. |
| `--relaunch` | boolean | `false` | Preserve existing state instead of clearing it. See `product/specs/relaunch.md`. |
| `--help` | boolean | `false` | Print usage text to stdout and exit 0. |
| `--version` | boolean | `false` | Print the application name and version to stdout and exit 0. |

### `--help`

Prints the usage summary to stdout and exits immediately with code 0. No side effects: the `.janissary/` directory is not created, no state is cleared, no server is started, and no browser window is opened.

### `--version`

Prints `<name> <version>` (read from `package.json` at runtime) to stdout and exits immediately with code 0. No side effects, same as `--help`.

### Usage errors

Unknown flags, malformed flags (e.g. bare `--port` with no value), invalid `--port` values (non-integer, out of range 1–65535), more than one positional argument, and a `<project-dir>` path that does not exist or is not a directory are rejected before the server starts. The error message is printed to stderr followed by a pointer to `--help`, and the process exits with code 2.

### Startup failures

When `janus` fails to start, the failed-to-start banner `<name> <version> — failed to start: <reason>` (so every report is self-identifying) followed by guidance on what to do next is written to both `.janissary/log/server.log` and the terminal, and the launcher exits with the server's own exit code (1 for startup failures, 2 for CLI usage errors). Two failures are recognized specifically:

- The requested port is already in use: the message names the port and suggests picking another with `--port=<n>` or omitting `--port` to choose one automatically.
- The web UI bundle is missing (a dev checkout where the web assets have not been built): the message points at `npm run build:web` or `npm start`.
- Another `janus` instance is already running against the same target directory: the message names the directory and the live process ID, suggests `janus <other-directory>` to run a second instance elsewhere, and names the lock file's path with instructions to delete it if the user is sure no other instance is actually running.

Any other failure falls back to the underlying error's message with the same banner. Setting the `JANUS_DEBUG=1` environment variable additionally prints the full stack trace after the message (also captured in the log).

### Startup sequence

For a normal launch (not `--help`, `--version`, or `stop`), the `janus` command detaches the server into the background and returns the shell prompt as soon as the server is ready, redirecting all of its output to `.janissary/log/server.log` instead of the terminal. `--help`, `--version`, and `stop` run attached, printing straight to the terminal (see their own sections).

The detached server itself boots the full application against its target directory (the current directory, or the resolved `<project-dir>` argument):

1. Acquire an instance lock on the target directory, failing fast if another live `janus` process already holds it.
2. Initialize `.janissary/` subdirectories (agent state, database, profiles, workspace).
3. Start the transcript logger and transcript store.
4. Load application config from `.janissary/config.json`.
5. Unless `--relaunch`: clear the state directory, transcript store, and workspace directory.
6. Start the HTTP server (on the requested port, or an ephemeral port if none given).
7. Write the server URL (`__JANUS_URL__ <url>`) and a human-readable banner to the log.
8. Unless `--no-open`: open the app in a Chrome app window (or the default browser if no system Chrome is found).
9. Register signal handlers for graceful shutdown (SIGINT, SIGTERM), app window cleanup, and instance lock release on exit.

The launcher watches `.janissary/log/server.log` for the `__JANUS_URL__` line. Once it appears, the launcher exits 0 and prints nothing to the terminal — except under `--no-open`, where it prints the server URL, since no window opens to carry the session visually. If the server process exits before that line appears, the launcher relays the tail of the log to the terminal and exits with the server's own exit code. If neither happens within 20 seconds, the launcher kills the detached server, prints a timeout failure to the terminal, and exits 1.

`.janissary/log/server.log` is truncated at the start of a normal launch and appended to under `--relaunch`, mirroring how state and workspace are cleared or preserved. It captures everything the server would otherwise have printed to stdout/stderr: the URL banner, the human-readable banner, non-fatal warnings (invalid config/agent-names/harness-models files, extension load failures), and — on a startup failure — the failed-to-start banner.

Because the server is detached, Ctrl+C on the launcher no longer stops it (the launcher has already exited by the time a user could press it). Use `janus stop` to shut down a running instance.

### Shutdown sequence

Shutdown is triggered by any of:
- SIGINT or SIGTERM
- The `quit` command from a connected client
- Closing the last browser window or tab (all WebSocket clients disconnect)

The server broadcasts a `bye` event to all connected browser windows (telling them to close), waits 100 ms for them to shut down, then closes the HTTP server and WebSocket connections, and exits. On exit, the Chrome app window is killed and the instance lock is released.

### Stopping a running instance

`janus stop [<project-dir>]` runs attached, printing straight to the terminal. It reads the instance lock (`.janissary/lock`) for the target directory (current directory by default) and, if the recorded process ID is alive, sends it SIGTERM — triggering the same graceful shutdown sequence above. If no lock file exists for that directory, or the recorded process is no longer alive, it prints `no running janus instance for <dir>` and exits 0 (there being nothing to stop is not an error).

### Project directory scope

The resolved target directory (from `<project-dir>`, or the current directory) serves as the default root for all shell commands, harness tabs, file-navigator roots, and workspace-clone detection throughout the session. The `$root` path token and path-abbreviation display are anchored to this directory.
