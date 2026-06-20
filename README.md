# Janissary

> A [Janissary](https://en.wikipedia.org/wiki/Janissary) was an elite infantry soldier in the Ottoman Empire — a servant of the gate, loyal, and ever-ready. This tool channels that same spirit as your terminal's loyal servant.

**Janissary** is a terminal UI shell built with [Ink](https://github.com/vadimdemedes/ink) and React. It provides a full-screen interactive interface with built-in commands and the ability to execute arbitrary shell commands.

## Usage

```
npx janus
```

Or install globally:

```
npm install -g janissary
janus
```

### Commands

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `dashboard`  | Show the dashboard                 |
| `settings`   | Show settings                      |
| `about`      | Show information about the tool    |
| `help`       | List available commands            |
| `state`      | Show agent state fields (truncated) |
| `clear`      | Clear the output log               |
| `quit`       | Exit the application               |
| `close`      | Close the current tab (exits if last) |
| `agent`      | Create a new agent tab             |
| `next`       | Switch to the next tab             |
| `hist`       | Open command history picker        |
| `msg`        | Send a message to another agent    |

### State persistence

Per-agent data (command history, transcript, shell working directory, tab number, and received message context) is persisted to `.janussary/state/<name>.json`. On normal startup the state directory is cleared automatically.

Reopen previous state with the `--relaunch` flag:

```
janus --relaunch
```

This restores all agent tabs with their command history, transcripts, and shell working directories from the previous session, so you pick up exactly where you left off. Tabs are restored in their saved order — each tab's recorded number, position, and dot color are preserved, so the tab strip reappears exactly as you left it.

### Agent messaging

Agents (tabs) can send messages to one another. Each agent has its own FIFO queue, and messages are processed one at a time:

```
msg <agent> <info|request|command> <text>
```

| Kind | Behavior |
| ---- | -------- |
| `info` | Displayed in the recipient's transcript and appended to that agent's `context` (persisted in its state, visible via `state`). |
| `request` | Processed in the recipient's window as if typed into its prompt — built-in commands and auto-run shell commands both work. The result is shown in the recipient's window; nothing is returned to the sender. |
| `command` | Run as a shell command in the recipient's own shell (as if that agent typed it), with no response. |

Examples:

```
msg bilal info build finished, your turn
msg bilal request git status
msg bilal command npm run build
```

The kind accepts short aliases (`i`/`r`/`c`). A `command` runs as a raw shell command in the recipient's shell, while a `request` is processed through the recipient's full window logic (built-ins and shell). Both stream into the recipient's transcript. Commands that need an interactive PTY (`less`, `vim`, `top`, …) are **not** run remotely — those only work in a foreground tab.

Prefix any command with `` ` `` to run it directly in your shell:

```
 `ls -la
 `echo hello world
 `npm install
```

Common shell commands (`ls`, `grep`, `cat`, …) also run automatically without the backtick when they don't collide with a built-in. Conversely, prefix a command with `/` to force the built-in dispatcher (e.g. `/clear` to clear the log even though `clear` is also a shell command).

### Interactive programs

Full-screen / interactive programs that need a real terminal — pagers (`less`, `more`, `man`), editors (`vim`, `nano`), monitors (`top`, `htop`), REPLs (`python`, `node`, `psql`), and the like — run in a pseudo-terminal (via [node-pty](https://github.com/microsoft/node-pty)) that takes over the screen for the duration of the session:

```
 `less SPEC.md
 `vim src/cli.tsx
 `git log | less
```

The Janissary UI is suspended while the program runs (keystrokes go straight to it) and is restored when you exit (e.g. `q` in `less`). Interactive programs are detected by the command name, including through pipelines and wrappers like `sudo`/`env`.

### Key Bindings

| Key                 | Action                            |
| ------------------- | --------------------------------- |
| `←` / `→`           | Move cursor in the input field    |
| `↑` / `↓`           | Previous / next command in history |
| `Shift+←` / `Shift+→` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right  |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down    |
| `Ctrl+R`            | Open command history picker        |
| `Enter`             | Execute the current command        |
| `Ctrl+C`            | Exit                              |

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

## License

UNLICENSED — proprietary
