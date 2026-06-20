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
| `agent`      | Create a new agent tab (add `--workspace` to clone the repo) |
| `next`       | Switch to the next tab             |
| `hist`       | Open command history picker        |
| `msg`        | Send a message to another agent    |
| `broadcast`  | Send a message to several or all agents |
| `acp`        | Send a prompt to an external ACP agent |

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
| `request` | The recipient shows the incoming request as `● request from <sender>: <command>` (in the sender's color), executes it (built-ins + shell), and returns the output to the **sender** as a `response` message — a `● <recipient>:` header with the output on the following lines, bordered in the recipient's color. |
| `command` | Run as a shell command in the recipient's own shell (as if that agent typed it), with no response. |

Examples:

```
msg bilal info build finished, your turn
msg bilal request git status
msg bilal command npm run build
```

The kind accepts short aliases (`i`/`r`/`c`). A `command` runs as a raw shell command in the recipient's shell (streamed into its transcript, no reply); a `request` shows `● request from <sender>: <command>` in the recipient, runs through its full window logic (built-ins and shell), and returns the captured output to the sender as a `response`. Commands that need an interactive PTY (`less`, `vim`, `top`, …) are **not** run remotely — those only work in a foreground tab.

To message several agents at once, use `broadcast`:

```
broadcast <all|agent[,agent...]> <info|request|command> <text>
```

Use `all` (or `*`) to reach every other agent, or a comma-separated list to target a specific set. The sender is always excluded. Examples:

```
broadcast all info standby for deploy
broadcast bilal,aslan request git status
```

Prefix any command with `` ` `` to run it directly in your shell:

```
 `ls -la
 `echo hello world
 `npm install
```

Common shell commands (`ls`, `grep`, `cat`, …) also run automatically without the backtick when they don't collide with a built-in. Conversely, prefix a command with `/` to force the built-in dispatcher (e.g. `/clear` to clear the log even though `clear` is also a shell command).

### Workspace

Use `agent --workspace` (or `agent -w`) to create an agent tab with a disposable git workspace:

```
agent bilal -w
```

This clones the root repo (detected from the current directory) into `.janussary/workspace/bilal/` via `git clone --shared` — no network needed, completes in milliseconds. The agent's shell spawns inside the workspace. Make changes, commit, push, then close the tab — the workspace is automatically removed.

### Interactive programs

Full-screen / interactive programs that need a real terminal — pagers (`less`, `more`, `man`), editors (`vim`, `nano`), monitors (`top`, `htop`), REPLs (`python`, `node`, `psql`), and the like — run in a pseudo-terminal (via [node-pty](https://github.com/microsoft/node-pty)) that takes over the screen for the duration of the session:

```
 `less SPEC.md
 `vim src/cli.tsx
 `git log | less
```

The Janissary UI is suspended while the program runs (keystrokes go straight to it) and is restored when you exit (e.g. `q` in `less`). Interactive programs are detected by the command name, including through pipelines and wrappers like `sudo`/`env`.

### External ACP agents (experimental)

A tab can drive any [Agent Client Protocol](https://agentclientprotocol.com) agent (e.g. Claude Code via `@agentclientprotocol/claude-agent-acp`, or `opencode acp`). Point `JANUS_ACP_CMD` at the agent command, then prompt it with `acp`:

```
export JANUS_ACP_CMD="npx @agentclientprotocol/claude-agent-acp"
acp summarize the architecture of this repo
```

Janissary acts as the ACP client: it spawns the agent as a subprocess, speaks JSON-RPC over stdio, and streams the agent's reply into the tab. The connection is per-tab and reused across prompts. This MVP is read-only — tool-permission requests are auto-declined and filesystem/terminal callbacks are not yet offered.

#### Using OpenCode

[OpenCode](https://opencode.ai) ships an ACP server mode, so it works as a drop-in agent:

1. Install it (binary `opencode`, npm package `opencode-ai`):

   ```
   npm install -g opencode-ai      # or: brew install anomalyco/tap/opencode
   ```

2. Authenticate and pick a model — OpenCode is multi-provider, so configure at least one provider before using it as an agent:

   ```
   opencode auth login
   ```

3. Point Janissary at it and prompt from a tab:

   ```
   export JANUS_ACP_CMD="opencode acp"
   acp summarize the architecture of this repo
   ```

To sanity-check the agent independently, run `opencode acp` in a plain terminal — it should start and silently wait for JSON-RPC on stdin (Ctrl+C to exit). If `opencode` isn't on your `PATH`, use `JANUS_ACP_CMD="npx opencode-ai acp"` (the first run may be slow while npx fetches it).

### Key Bindings

| Key                 | Action                            |
| ------------------- | --------------------------------- |
| `←` / `→`           | Move cursor in the input field    |
| `↑` / `↓`           | Previous / next command in history |
| `Shift+←` / `Shift+→` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right  |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down    |
| `Ctrl+R`            | Open command history picker        |
| `Tab`               | Complete a file path, or an agent name for `msg` / `broadcast` |
| `Enter`             | Execute the current command        |
| `Ctrl+C`            | Exit                              |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory, or — at the recipient position of `msg` / `broadcast` — active agent names (`broadcast` also offers `all` and completes each entry of a comma-separated list).

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
