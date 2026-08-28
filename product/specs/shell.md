# shell

Each tab has its own persistent shell process (spawned via `child_process.spawn`) that runs in the background for the lifetime of the tab. Shell processes are spawned lazily on the first shell command (the `shell` keyword) and kept alive until the tab is closed or the application exits.

### Shell startup files

A tab's shell is the user's login shell (`$SHELL`, falling back to `bash`), started with its startup files suppressed so an interactive rc file cannot leak banners, prompts, or traps into captured command output. Each supported shell is given the flags that shell actually accepts: `bash` starts with `--norc --noprofile`, and `zsh` with `--no-rcs` — zsh rejects bash's spelling outright and would otherwise exit immediately instead of producing a working tab shell. A login shell that is neither starts with no startup flags at all and reads its own startup files, which is preferable to failing to launch on an option it does not recognize.

### Shell command execution

Shell commands (the `shell` keyword, stripped) are written to the tab's persistent shell via stdin. The command is wrapped in a subshell with stderr redirected to stdout: `(${cmd}) 2>&1`. A unique delimiter (`echo "__JS_END_<tab>_<timestamp>__"`) is written after the command to mark the end of output.

A local tab's shell runs inside a pseudo-terminal, so every command it runs has a real terminal attached (see Interactive detection below). One consequence is visible immediately: programs that adapt to a terminal now behave as they would in one — tools emit color, and commands that page their own output, such as `git log` and `git diff`, open a pager rather than dumping plain text. The environment is otherwise left alone. Before any command runs, the shell is put into a quiet state — echo off, empty prompts — so the terminal's own echo cannot appear in captured output. Remote tabs' shells, and every tab's shell when interactive detection is turned off, are plain pipes as before.

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

## Interactive detection

The list of interactive programs cannot cover everything — a locally built TUI, or a program under a name the list does not know, would otherwise run in the transcript where it errors, warns that it has no terminal, or waits for input the user cannot type. Because a local tab's shell runs inside a pseudo-terminal, such a program behaves normally and announces itself, and Janissary watches for that.

**Recognition comes first.** A command whose program is on the interactive list opens a terminal *before it runs*, exactly as it always has, with no transcript entry and no detection involved. Detection applies only to what the list does not cover.

**What counts as evidence.** A command is promoted when its output shows the program taking the screen: entering the alternate screen, or repeatedly addressing the cursor at absolute positions. Hiding the cursor is deliberately not evidence, because ordinary tools do it for spinners and progress bars — a routine install or test run is never promoted.

**What promotion looks like.** The tab switches to a full-tab terminal mid-command, and the output already produced is replayed into it so the program's first screen is intact. Every later chunk streams into the terminal as it arrives, so the screen stays live for the rest of the command. Keys go to the program exactly as in any other terminal takeover. The command's transcript entry stays in place, still marked running; when the command finishes, the tab returns to the transcript and that entry reads `(ran in terminal)`. The captured fragment is dropped rather than shown, because it is half of a redrawn screen. The tab returns to the transcript when the *command* ends, not when the program exits — the tab's shell outlives it.

A promotion in a background tab happens where it is: the tab is marked unread, and focus stays where the user put it.

**Forcing it by hand.** A running command's transcript entry carries an **open in terminal** action, and `Ctrl+O` does the same for the active tab's running command. This covers a program that needs a terminal but never announces it — a password prompt, a `read`, a bare REPL — which would otherwise sit waiting. Forcing a terminal this way is a one-off and is not remembered.

**Remembering what was detected.** When detection promotes a command, its program is remembered in `.janissary/interactive-commands.json`, which is read at startup and merged with the built-in list. The next run of that program is recognized before it starts, so detection costs at most one run per program. What is remembered is the program name, or the program and its subcommand where the argument distinguishes a mode — `git log` is remembered without making every `git` command interactive. A command made of several piped or chained segments is not remembered, since its output cannot say which segment took the screen. The file is a plain list, hand-editable: delete an entry to forget it, or delete the file to start over. It survives ordinary launches, and a malformed file is ignored rather than repaired.

Commands delivered by `msg`/`broadcast` and commands fired by a schedule run in the same shell but are never promoted: the first must return captured text to the agent that asked, and nobody is watching the second. A scheduled command that queues behind a busy agent loses that marking and is treated as if typed.

**Turning it off.** The `interactiveShellDetection` setting in `.janissary/config.json` (default on) governs all of the above. With it off, shells are plain pipes, nothing is detected or promoted, and only the interactive-program list applies — but anything already remembered still counts, since the learned list is read either way.

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