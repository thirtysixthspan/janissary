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
| `acp`        | Send a prompt to the OpenCode ACP agent |
| `db`         | Create, delete, query, or list SQLite databases |
| `connection` | List or close open connections (sqlite/shell/acp) |

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

### Databases

Janissary can create and query [SQLite](https://www.sqlite.org) databases directly from the command line. Databases are stored at `.janussary/db/sqlite/<name>.sqlite` and — unlike agent state and workspaces — **persist across launches** (they are never cleared automatically).

```
db sqlite create <name>          # create an empty database
db sqlite delete <name>          # delete a database file
db sqlite query  <name> <sql>    # run SQL against a database
db sqlite list                   # list existing databases
```

The `query` subcommand runs any SQL. Statements that return rows (`SELECT`, `PRAGMA`, `WITH`, `EXPLAIN`) are printed as an aligned table with a row count; other statements (`CREATE`, `INSERT`, `UPDATE`, …) report `OK.` and may contain several semicolon-separated statements at once.

```
db sqlite create shop
db sqlite query shop CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)
db sqlite query shop INSERT INTO items (name) VALUES ('widget'), ('gadget')
db sqlite query shop SELECT * FROM items
```

Database names are restricted to letters, numbers, `-`, and `_` (so a name can never escape the storage directory). SQLite is provided by Node's built-in `node:sqlite` module — no extra dependency is required.

**Persistent connections.** The first `db` command for a database opens a connection that stays open — across commands and tabs — until you close it explicitly or quit the app. Many databases can be connected at once, so connection-scoped state (transactions, `TEMP` tables, pragmas) survives between commands. See the Connections section for managing them.

### Connections

Janissary keeps long-lived connections open: SQLite databases, each tab's shell, and each tab's ACP agent. The `connection` command lists and closes them.

```
connection list                       # list open connections
connection close sqlite:<name>        # close a database connection
connection close shell:<shell>        # close this tab's shell (e.g. shell:bash)
connection close acp:opencode         # close this tab's ACP agent
```

Connections are addressed as `<kind>:<id>`:

| Kind | Id | Scope |
| ---- | -- | ----- |
| `sqlite` | database name | Global — shared across all tabs. |
| `shell` | shell program (`bash`, `zsh`, …) | The current tab. |
| `acp` | `opencode` | The current tab. |

Closing a connection is safe: a SQLite connection reopens on the next `db` command, a shell respawns on the next shell command (restoring its working directory), and an ACP agent reconnects on the next `acp` prompt. All connections are closed automatically when the owning tab is closed or the app exits.

A small `connections` panel floats at the top-right of each tab, listing that tab's live connections — its shell, its ACP agent, and each `sqlite:<name>` database it has accessed — so opening a database is reflected there immediately.

### Interactive programs

Full-screen / interactive programs that need a real terminal — pagers (`less`, `more`, `man`), editors (`vim`, `nano`), monitors (`top`, `htop`), REPLs (`python`, `node`, `psql`), and the like — run in a pseudo-terminal (via [node-pty](https://github.com/microsoft/node-pty)) that takes over the screen for the duration of the session:

```
 `less SPEC.md
 `vim src/cli.tsx
 `git log | less
```

The Janissary UI is suspended while the program runs (keystrokes go straight to it) and is restored when you exit (e.g. `q` in `less`). Interactive programs are detected by the command name, including through pipelines and wrappers like `sudo`/`env`.

### External ACP agents (experimental)

A tab can drive an [Agent Client Protocol](https://agentclientprotocol.com) agent. Janissary uses [OpenCode](https://opencode.ai) (`opencode acp`) as its built-in agent — just prompt it with `acp`:

```
acp summarize the architecture of this repo
```

Janissary acts as the ACP client: it spawns the agent as a subprocess, speaks JSON-RPC over stdio, and streams the agent's reply into the tab. The connection is per-tab and reused across prompts. This MVP is read-only — tool-permission requests are auto-declined and filesystem/terminal callbacks are not yet offered.

#### Database help (autonomous tool loop)

The agent is primed with the `db` command syntax on every prompt, so you can ask for database work in plain language:

```
acp list the actors in the movies database
```

The agent issues a single `db` command, Janissary runs it automatically, and the output is fed back to the agent as context. It keeps issuing commands and reading results in a loop until it can answer — then it replies with no trailing command and the loop stops. Each executed command and its result appear in the transcript so you can see exactly what ran. The loop is capped (8 `db` steps) to avoid runaway sessions, and only `db` commands are auto-run — the agent cannot execute arbitrary shell.

#### Setting up OpenCode

OpenCode ships an ACP server mode, so it works as a drop-in agent. Before using `acp`, install and authenticate it:

1. Install it (binary `opencode`, npm package `opencode-ai`):

   ```
   npm install -g opencode-ai      # or: brew install anomalyco/tap/opencode
   ```

2. Authenticate and pick a model — OpenCode is multi-provider, so configure at least one provider before using it as an agent:

   ```
   opencode auth login
   ```

`opencode` must be on your `PATH`. To sanity-check the agent independently, run `opencode acp` in a plain terminal — it should start and silently wait for JSON-RPC on stdin (Ctrl+C to exit).

### Key Bindings

| Key                 | Action                            |
| ------------------- | --------------------------------- |
| `←` / `→`           | Move cursor in the input field    |
| `↑` / `↓`           | Previous / next command in history |
| `Shift+←` / `Shift+→` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right  |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down    |
| `Ctrl+R`            | Open command history picker        |
| `Tab`               | Complete a file path, an agent name for `msg` / `broadcast`, or a connection string for `connection close` |
| `Enter`             | Execute the current command        |
| `Ctrl+C`            | Exit                              |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the recipient position of `msg` / `broadcast`, active agent names (`broadcast` also offers `all` and completes each entry of a comma-separated list); and at the target of `connection close`, the tab's open connection strings (`sqlite:<name>`, `shell:<shell>`, `acp:opencode`).

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
