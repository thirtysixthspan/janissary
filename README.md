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

### State persistence

Per-agent data (command history, transcript, shell working directory) is persisted to `.janussary/state/<name>.json`. On normal startup the state directory is cleared automatically.

Reopen previous state with the `--relaunch` flag:

```
janus --relaunch
```

This restores all agent tabs with their command history, transcripts, and shell working directories from the previous session, so you pick up exactly where you left off.

Prefix any command with `` ` `` to run it directly in your shell:

```
 `ls -la
 `echo hello world
 `npm install
```

### Key Bindings

| Key            | Action                           |
| -------------- | -------------------------------- |
| `↑` / `↓`      | Scroll through output history    |
| `Ctrl+P`       | Previous command in history       |
| `Ctrl+N`       | Next command in history           |
| `←` / `→`      | Move cursor in the input field    |
| `Enter`        | Execute the current command       |
| `Ctrl+C`       | Exit                             |

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
