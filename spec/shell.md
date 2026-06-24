# shell

Each tab has its own persistent shell process (spawned via `child_process.spawn`) that runs in the background for the lifetime of the tab. Shell processes are spawned lazily on the first shell command (the `shell` keyword) and kept alive until the tab is closed or the application exits.

### Shell command execution

Shell commands (the `shell` keyword, stripped) are written to the tab's persistent shell via stdin. The command is wrapped in a subshell with stderr redirected to stdout: `(${cmd}) 2>&1`. A unique delimiter (`echo "__JS_END_<tab>_<timestamp>__"`) is written after the command to mark the end of output.

### Shell output streaming

Output from the shell's stdout and stderr is captured via `data` event listeners. As chunks arrive, the tab's log entry is updated progressively, displaying output line by line as it is produced. When the delimiter is detected, the log entry is finalized (marked not running) and the listeners are removed.

### Shell lifecycle

Shells are created on demand (lazy initialization at the first shell command per tab). On application exit (`quit`/`exit` or Ctrl+C), all shell processes are killed; closing a single tab (`close`) kills just that tab's shell. Shell processes are also killed if the shell process crashes or exits unexpectedly — a new shell is spawned automatically on the next command.

### Unmount safety

Shell `data` event listeners check an unmount flag before updating React state. On component unmount, all shell processes are killed and their references are cleared from the shells map.

### Tab-safe async

Shell output uses the tab index captured at execution time via a ref, so output updates are routed to the correct tab's log even if the user switches tabs while a shell command runs.
