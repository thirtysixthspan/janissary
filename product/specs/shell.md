# shell

Each tab has its own persistent shell process (spawned via `child_process.spawn`) that runs in the background for the lifetime of the tab. Shell processes are spawned lazily on the first shell command (the `shell` keyword) and kept alive until the tab is closed or the application exits.

### Shell startup files

A tab's shell is the user's login shell (`$SHELL`, falling back to `bash`), started with its startup files suppressed so an interactive rc file cannot leak banners, prompts, or traps into captured command output. Each supported shell is given the flags that shell actually accepts: `bash` starts with `--norc --noprofile`, and `zsh` with `--no-rcs` — zsh rejects bash's spelling outright and would otherwise exit immediately instead of producing a working tab shell. A login shell that is neither starts with no startup flags at all and reads its own startup files, which is preferable to failing to launch on an option it does not recognize.

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

## Interactive PTY takeover

Full-screen and interactive programs — `htop`, `vim`, `less`, `top`, `man`, `python`, REPLs, etc. — cannot run through the persistent piped shell. When a shell command is detected as interactive (see `src/interactive.ts`), or when the `shell` command is given a `--pty` flag, the tab switches into **PTY takeover mode**:

- The transcript and command bar are hidden.
- A full-tab xterm.js terminal takes over the tab body, exactly like a harness tab.
- All keyboard input — including `Ctrl+C`, `Ctrl+D`, `Ctrl+Z` — is forwarded to the PTY. Only the tab-switch chord (`Shift+←/→`) bubbles out to the window handler.
- `Shift+Enter` is translated to `ESC` + `CR` (the Alt/Option+Enter sequence) before it reaches the PTY, so programs that treat it as a line continuation (e.g. AI harnesses) accept multi-line input — see the input model in `harness.md`.
- The xterm terminal is focused automatically on launch and whenever the tab is switched back to.

When the program exits, the tab returns to the normal transcript view exactly as it was before the PTY launched. No log entry is appended — the transcript is simply restored.

While in PTY takeover mode, the tab shows the same metadata row (working directory and active-flag
icons) as the underlying agent tab — see Metadata row in `tabs.md`.

### Forcing PTY mode with `--pty`

`shell --pty <command>` forces PTY takeover regardless of whether `<command>` is on the interactive-program list, for commands that need a real terminal but aren't auto-detected. A bare `shell --pty`, with no command following, opens the user's login shell (`$SHELL`, falling back to `bash`) directly in a PTY — an interactive shell prompt inside the tab.

### Multi-tab persistence

All agent tabs with a running interactive PTY stay mounted simultaneously (only the active tab is visible, the rest use `display: none`). This preserves xterm state — alternate-screen TUIs like `htop` keep their cursor position and screen buffer intact across tab switches.

### Closing a tab with a running PTY

`close` kills the PTY (SIGTERM) and removes the tab, the same as closing any other connection. The PTY exit fires `onPtyExit`, which clears `activePty` — but since the tab is already gone this is a no-op.

## Shell Working Directory Persistence

### Per-agent cwd tracking

After each shell command completes, `queryShellPwd` sends `pwd` to the shell and captures the response. The working directory is saved to the agent state file's `cwd` field and kept in a `cwdRef` map keyed by agent label.

### Restoration on relaunch

On `--relaunch`, saved cwd values are loaded from agent state files into `cwdRef`. When `getShell` creates a new shell for a tab, it checks `cwdRef` for the tab's label and sends `cd "<cwd>"` to the shell before any user commands.