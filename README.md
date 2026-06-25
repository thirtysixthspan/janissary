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
| `browser`    | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `open`       | Open a file by type — images in a tab, or `open external` in the OS viewer |
| `connection` | List or close open connections (sqlite/shell/acp/browser) |
| `schedule`   | Run a command later — once or on a recurring schedule |
| `profile`    | Launch a saved set of agents for a use case |

### Configuration

Application settings are stored in `.janissary/config.json`. A default config is created automatically on first launch if the file does not exist:

```json
{
  "transcriptMaxLines": 25000
}
```

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `transcriptMaxLines` | `25000` | Maximum number of transcript log entries kept per tab. When the limit is exceeded, the oldest entries are trimmed. |

### State persistence

Per-agent data (command history, transcript, shell working directory, tab number, and received message context) is persisted to `.janissary/state/<name>.json`. On normal startup the state directory is cleared automatically.

Reopen previous state with the `--relaunch` flag:

```
janus --relaunch
```

This restores all agent tabs with their command history, transcripts, and shell working directories from the previous session, so you pick up exactly where you left off. Tabs are restored in their saved order — each tab's recorded number, position, and dot color are preserved, so the tab strip reappears exactly as you left it.

### Root path

The directory you launch from is the **root path**, and the transcript abbreviates it to `$root` so paths stay short and the project is obvious at a glance:

```
$root/                  = /Users/name/dev/janissary
$root/workspace/emrah   = /Users/name/dev/janissary/.janissary/workspace/emrah
```

The hidden state directory (`.janissary`) inside the root folds into `$root` too, so internal locations like a workspaced agent's clone read as `$root/workspace/<name>` instead of exposing `.janissary`. The shortcut is applied wherever Janissary renders a path into the transcript — the working directory on each command prompt, the connections panel, and its own status messages — and composes with the `~` home shortcut, with the more specific `$root` winning for paths inside the root. It is display-only: the underlying paths are unchanged, and a shell command's own output is shown verbatim.

### Append-only log

All tab transcript text is automatically logged to append-only JSON files in `.janissary/log/`. Each line is a JSON object with a UTC timestamp, the tab name, and the content text:

```
.janissary/log/
  2026-06-22.json
  2026-06-23.json
```

The log rotates daily — entries go to `YYYY-MM-DD.json` based on the current UTC date. Each JSON line contains:

```json
{"timestamp":"22:55:20.690","agent":"janus","text":"ls -la"}
```

Both command inputs and their outputs are logged as separate entries, so the log captures a complete record of everything that appeared in each tab. The log directory is created on first launch and persists across sessions.

### Agent messaging

Agents (tabs) can send messages to one another. Each agent has its own FIFO queue, and messages are processed one at a time:

```
msg <agent> <info|request|command> <text>
```

| Kind | Behavior |
| ---- | -------- |
| `info` | Displayed in the recipient's transcript and appended to that agent's `context` (persisted in its state, visible via `state`). |
| `request` | The recipient shows the incoming request as `● request from <sender>: <command>` (in the sender's color), executes it (built-ins, or a `shell`-prefixed shell command), and returns the output to the **sender** as a `response` message — a `● <recipient>:` header with the output on the following lines, bordered in the recipient's color. |
| `command` | Run as a shell command in the recipient's own shell (as if that agent typed it), with no response. |

Examples:

```
msg bilal info build finished, your turn
msg bilal request shell git status
msg bilal command npm run build
```

The kind accepts short aliases (`i`/`r`/`c`). A `command` runs as a raw shell command in the recipient's shell (streamed into its transcript, no reply); a `request` shows `● request from <sender>: <command>` in the recipient, runs through its full window logic (built-ins, or a `shell`-prefixed shell command), and returns the captured output to the sender as a `response`. Commands that need an interactive PTY (`less`, `vim`, `top`, …) are **not** run remotely — those only work in a foreground tab.

To message several agents at once, use `broadcast`:

```
broadcast <all|agent[,agent...]> <info|request|command> <text>
```

Use `all` (or `*`) to reach every other agent, or a comma-separated list to target a specific set. The sender is always excluded. Examples:

```
broadcast all info standby for deploy
broadcast bilal,aslan request shell git status
```

Prefix a command with the `shell` keyword to run it in your shell:

```
shell ls -la
shell echo hello world
shell npm install
```

The `shell` keyword is required — a bare command that isn't a built-in (e.g. `ls`) is reported as an unknown command rather than run in the shell, so a stray word never executes anything. Conversely, prefix a command with `/` to force the built-in dispatcher (e.g. `/clear` to clear the log even though `clear` is also a shell command).

### Command comments

Text wrapped in `##` delimiters is stripped from a command before it runs (and before it is saved to history). A comment can sit anywhere in the line:

```
## run a clean build ## npm run build      → npm run build
npm run build ## once the deps are ready    → npm run build
echo hello ## inline note ## world          → echo hello world
```

A terminated comment (`## … ##`) is removed wherever it appears, collapsing the surrounding whitespace. An unterminated comment (`## …` with no closing `##`) removes everything from `##` to the end of the line. This lets you annotate or temporarily disable part of a command without retyping it.

### Scheduling

`schedule` queues a command to run later in the current agent's tab. Each agent keeps its
own schedule in its state file. When an entry fires, the command runs in that tab exactly
as if you had typed it, tagged with a `## scheduled ##` comment.

Every timer is named — the name is the first word after `schedule`. The name is the timer's
id, so it shows in the schedule window and you cancel it by name. Names must be unique per
agent (and can't be `list`, `cancel`, or `clear`).

```
schedule deploy   at 3:35pm npm run deploy            # once, today (or tomorrow if passed)
schedule pull     on august 12th at 2pm shell git pull # once, at a date (default 9:00am)
schedule fetch    every 5m shell git fetch            # recurring interval (m / h / d / w)
schedule status   every day at 9am shell git status   # recurring at a clock time
schedule standup  every monday at 9am broadcast all info standup  # recurring on a weekday
```

Times accept `3:35pm`, `2pm`, or `14:00`; dates accept `august 12th`, `aug 12`, or `8/12`.

Manage entries with:

```
schedule list           # show this agent's entries (name, schedule, next run, command)
schedule cancel deploy  # remove one entry by name
schedule clear          # remove all of this agent's entries
```

Firing is checked once a second. A schedule only runs while its agent's tab is open; if the
agent isn't open as a tab, that firing is skipped and the entry stays in the state file.

While the active agent has any scheduled timers, a small `schedule` window floats at the
top-right (just below the `connections` window) listing each timer's id/name, schedule, and
next run time. It disappears once the schedule is empty.

### Profiles

A profile is a reusable set of agents for a particular use case — writing code, surfing the
web, authoring a book, a specific task. Profiles live in a top-level `profiles/` directory
(committable, unlike `.janissary/`). Each profile is its own dasherized-name directory
holding one `<agent>.json` file per agent, in the agent-state schema (the same format as
`.janissary/state/<name>.json`). The filename is the agent's name.

```
profiles/
  writing-code/
    builder.json
    reviewer.json
  surfing-the-web/
    scout.json
```

`profile launch <name>` opens a tab for each agent in the profile, restoring its saved state
(command history, transcript, working directory, schedule). Agents already open as tabs are
skipped. `profile list` shows the available profiles.

```
profile launch writing-code
profile list
```

### Workspace

Use `agent --workspace` (or `agent -w`) to create an agent tab with a disposable git workspace:

```
agent bilal -w
```

This clones the root repo (detected from the current directory) into `.janissary/workspace/bilal/` via `git clone --shared` — no network needed, completes in milliseconds. The agent's shell spawns inside the workspace. Make changes, commit, push, then close the tab — the workspace is automatically removed.

### Databases

Janissary can create and query [SQLite](https://www.sqlite.org) databases directly from the command line. Databases are stored at `.janissary/db/sqlite/<name>.sqlite` and — unlike agent state and workspaces — **persist across launches** (they are never cleared automatically).

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

### Web browser

Each tab can drive a real [Playwright](https://playwright.dev) browser to fetch web pages as a regular user — running JavaScript, inspecting the viewport, and reading rendered content. Every tab launches its **own** browser process the first time it is used, so one tab can run headless while another runs headed.

```
browser open [name] [--headed]   # open a window (launches this tab's browser); -H = visible
browser list                     # this tab's windows (current marked with *)
browser use <id>                 # switch the current window
browser goto <url>               # navigate the current window
browser content                  # the current page's rendered text
browser eval <js>                # run JavaScript in the page and print the result
browser shot                     # screenshot to a temp file and open it in Preview (macOS)
browser close [id]               # close the current window, or window <id>
browser window close <id>        # close a specific window (same as browser close <id>)
```

A "window" is an isolated browsing context (its own cookies/storage). Page actions (`goto`, `content`, `eval`, `shot`) auto-open a window if the tab has none. The mode (headless/headed) is fixed when a tab's browser launches; to switch it, close all of that tab's windows (which ends the process) and `browser open` again. Browser windows are per-tab and live — they are not restored on `--relaunch`.

To look like an ordinary browser rather than automation, the browser applies several **bot-detection countermeasures**:

- Launches in Chromium's **new headless** mode (`channel: 'chromium'`), which behaves like a real browser instead of the easily-detected legacy headless shell.
- Disables the automation flag (`--disable-blink-features=AutomationControlled`) and runs the [stealth plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) (via `playwright-extra`), which masks the usual tells — `navigator.webdriver`, a missing `window.chrome`, and inconsistent permissions/plugins/WebGL fingerprints.
- Gives **each window its own coherent fingerprint**: a randomized desktop Chrome user agent (varied platform, version pinned to the real engine so it matches the client hints), with a matching `Sec-CH-UA-Platform`, `Accept-Language`, timezone, and viewport — so isolated windows never share an identical signature and no field contradicts another.

The browser is also available to the tab's **ACP agent**: ask it to "visit a URL and summarize it" and it will issue `browser goto` / `browser content` commands in its tool loop, the host runs them against that tab's browser, and the page text is fed back for the answer. See [External ACP agents](#external-acp-agents-experimental).

### Opening files

The `open` command opens a file according to its type. It is a dispatcher: each file type is handled by its own **opener**, so supporting a new type is just a matter of adding one — the command itself never changes. Images are supported today.

```
open <path>            # open the file in the app (images: a new image tab)
open external <path>   # hand the file to the OS viewer (images: Preview on macOS)
open '*.png'           # a wildcard opens each matching file (up to 10)
```

- **`open <image>`** mounts a new **image tab** showing the image's name, size, and location alongside the image itself. The tab has no command bar; it is named `image` with a close (`×`) button on the tab, and otherwise behaves like any tab — reorder it within its group with `Ctrl+←` / `Ctrl+→`. A landscape image fills the full width; a portrait image fills the remaining height. Image tabs are live and in-memory — they are not restored on `--relaunch`.
- **`open external <image>`** launches the file in the operating system's image viewer.
- **Wildcards** are expanded by the shell (in the tab's working directory), and `open` then acts on each matched file in turn, up to a maximum of **10** — extra matches are skipped with a note, and a pattern that matches nothing reports no matching files. A path with no wildcard is always a single literal target.

An unrecognized file type reports that no opener is registered for it.

### Connections

Janissary keeps long-lived connections open: SQLite databases, each tab's shell, each tab's ACP agent, and each tab's browser windows. The `connection` command lists and closes them.

```
connection list                       # list open connections
connection close sqlite:<name>        # close a database connection
connection close shell:<shell>        # close this tab's shell (e.g. shell:bash)
connection close acp:opencode         # close this tab's ACP agent
connection close browser:<id>         # close one of this tab's browser windows (e.g. browser:w1)
```

Connections are addressed as `<kind>:<id>`:

| Kind | Id | Scope |
| ---- | -- | ----- |
| `sqlite` | database name | Global — shared across all tabs. |
| `shell` | shell program (`bash`, `zsh`, …) | The current tab. |
| `acp` | `opencode` | The current tab. |
| `browser` | window id (`w1`, `w2`, …) | The current tab. |

Closing a connection is safe: a SQLite connection reopens on the next `db` command, a shell respawns on the next shell command (restoring its working directory), and an ACP agent reconnects on the next `acp` prompt. Closing a tab's last browser window ends that tab's browser process. All connections are closed automatically when the owning tab is closed or the app exits.

A small `connections` panel floats at the top-right of each tab, listing that tab's live connections — its shell, its ACP agent, each open browser window (`browser:<id> (<mode>)`), and each `sqlite:<name>` database it has accessed — so opening a connection is reflected there immediately.

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

#### Database and browser help (autonomous tool loop)

The agent is primed with the `db` and `browser` command syntax on every prompt, so you can ask for database or web work in plain language:

```
acp list the actors in the movies database
acp visit https://example.com and summarize the page
```

The agent issues a single command, Janissary runs it automatically, and the output is fed back to the agent as context. It keeps issuing commands and reading results in a loop until it can answer — then it replies with no trailing command and the loop stops. Each run of auto-executed steps is **collapsed by default** into a single `▸ N tool steps` summary line so the transcript stays focused on your prompt and the agent's answer; press `Ctrl+T` to expand (or re-collapse) the steps for the current tab and see each command together with its response. The loop is capped (8 tool steps) to avoid runaway sessions, and only `db` and `browser` commands are auto-run — the agent cannot execute arbitrary shell. For the browser the agent sees a simplified surface (`browser goto`, `browser content`, `browser eval`); the host launches the tab's browser (headless) and opens a window automatically, and large pages are truncated before being fed back.

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
| `Shift+↑` / `Shift+↓` | Scroll the transcript up / down (accelerated — distance doubles each second) |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down (accelerated) |
| `Ctrl+P` / `Ctrl+N` | Scroll the transcript up / down one line (fixed) |
| `Ctrl+R`            | Open command history picker        |
| `Ctrl+T`            | Expand / collapse agent tool steps in the transcript |
| `Tab`               | Complete a file path, an agent name for `msg` / `broadcast`, a connection string for `connection close`, or a `browser` subcommand / window id |
| `Enter`             | Execute the current command        |
| `Ctrl+C`            | Exit                              |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the recipient position of `msg` / `broadcast`, active agent names (`broadcast` also offers `all` and completes each entry of a comma-separated list); at the target of `connection close`, the tab's open connection strings (`sqlite:<name>`, `shell:<shell>`, `acp:opencode`, `browser:<id>`); and for the `browser` command, its subcommands (`open`, `goto`, `content`, …) plus the tab's open window ids where one is expected (`browser use`, `browser window close`).

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

### Linting

```bash
npm run lint          # ESLint over the entire tree
npm run lint:files    # ESLint over only the files you care about
```

`npm run lint:files` defaults to every **uncommitted** file (staged, unstaged, and new
untracked files), so you can check just your changes without waiting on a full-tree lint:

```bash
npm run lint:files                          # all uncommitted files
npm run lint:files -- src/foo.ts web/src/App.tsx   # only the named files
npm run lint:files -- --fix                 # autofix the uncommitted set
npm run lint:files -- --fix src/foo.ts      # autofix specific files
```

Arguments after `--` that start with `-` are passed straight to ESLint; everything else is
treated as a path. Non-lintable paths (`.md`, `.json`, directories) are filtered out
automatically. The script lives at `scripts/lint-files.mjs`.

## License

UNLICENSED — proprietary
