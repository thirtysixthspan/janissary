# Janissary

> A [Janissary](https://en.wikipedia.org/wiki/Janissary) was an elite infantry soldier in the Ottoman Empire — a servant of the gate, loyal, and ever-ready. This tool channels that same spirit as your terminal's loyal servant.

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
| `quit`       | Exit the application (asks for confirmation) |
| `close`      | Close the current tab (exits if last); `close page #` closes a numbered page tab. `exit` is an alias |
| `agent`      | Create a new agent tab (add `--workspace` to clone the repo) |
| `next`       | Switch to the next tab             |
| `hist`       | Open command history picker        |
| `msg`        | Send a message to another agent    |
| `broadcast`  | Send a message to several or all agents |
| `acp`        | Send a prompt to the OpenCode ACP agent |
| `db`         | Create, delete, query, or list SQLite databases |
| `browser`    | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `open`       | Open images/files in a tab, or web pages embedded (`open https://…` / `open page …`) — sites that refuse framing render too; `open external` uses the OS viewer/browser |
| `connection` | List or close open connections (sqlite/shell/acp/browser) |
| `schedule`   | Run a command later — once or on a recurring schedule |
| `profile`    | Launch a saved set of agents for a use case |
| `harness`    | Open an AI coding harness (claude/opencode/codex) in a full-tab terminal (add `-w` to clone the repo) |
| `send`       | Deliver a line of input to any tab — types into a harness, or runs a command in an agent tab |
| `monitor`    | Start a persona-driven AI monitor — inline on the current tab, or watching other tabs/groups into a reporting tab |
| `unmonitor`  | Stop a monitor (`unmonitor <persona>`) or all monitors started from this tab (`--all`) |
| `monitors`   | List active monitors with their targets and suggestion counts |

### Harness tabs

`harness <name>` opens a new tab whose entire body is a running AI coding harness:

```
harness claude     → new tab "claude" running the claude CLI, full-tab
harness opencode   → new tab "opencode"
harness codex      → new tab "codex"
```

The harness fills the tab and receives all keyboard input, clicks, and mouse events. **Switching to a harness tab automatically focuses the terminal** — you can start typing immediately without clicking. Switch away with Shift+←/→ or by clicking a tab in the strip. Ctrl-combinations (including Ctrl+C) are sent to the harness. Close the tab with the tab strip's × or the `close` command (this quits the harness). Note that reorder/collapse chords are unavailable while a harness tab is focused — switch away first. The harness binary must be on `PATH`.

Add `-w` (or `--workspace`) to start the harness in a disposable git workspace, identical to `agent -w`:

```
harness claude -w
```

This clones the root repo into `.janissary/workspace/claude/` (or `claude-2`, etc. for subsequent tabs). The workspace is removed when the tab is closed.

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

An optional `in <tab>` right after the name schedules the timer **in another tab**: the entry
belongs to that tab — it shows in that tab's schedule window and fires there, not in the tab
that ran `schedule`. Harness tabs can be scheduled too: when the entry fires, the command is
typed into the harness PTY as a line of input (like `send`).

```
schedule standup in claude every day at 9am /standup   # types /standup into the claude harness
schedule sweep   in worker every 1h db vacuum          # runs `db vacuum` in the worker agent tab
```

Manage entries with:

```
schedule list           # show this agent's entries (name, schedule, next run, command)
schedule cancel deploy  # remove one entry by name
schedule clear          # remove all of this agent's entries
```

Each management form also takes `in <tab>` to operate on another tab's schedule — the only
way to manage a harness tab's timers, since a harness can't run commands itself:

```
schedule list in claude
schedule cancel standup in claude
schedule clear in claude
```

Firing is checked once a second. A schedule only runs while its agent's tab is open; if the
agent isn't open as a tab, that firing is skipped and the entry stays in the state file.
Agent schedules persist in the agent's state file; a harness tab's schedule lives in memory
only and ends with the tab. A timer due while its harness isn't accepting input yet stays
due and delivers as soon as the harness is running.

While the active agent has any scheduled timers, a small `schedule` window floats at the
top-right (just below the `connections` window) listing each timer's id/name, schedule, and
next run time. It disappears once the schedule is empty. On a harness tab the window floats
over the top-right of the terminal, so a harness's timers stay visible too.

### Sending input to another tab

`send <label> <text>` delivers a line of input to any named tab. Delivery depends on the
target's kind:

- **Harness tab** — the text is typed into the harness PTY as if a human had typed it
  (`text` followed by Enter).
- **Agent tab** — the text is run as a command in that tab, exactly like `msg <agent> command <text>`
  but without the messaging envelope.

```
send claude /standup     # types "/standup" into the claude harness
send worker db vacuum    # runs "db vacuum" in the worker agent tab
```

Because `send` is an ordinary command, it composes with `schedule` for free:

```
schedule standup every day at 9am send claude /standup
```

If the target tab doesn't exist, isn't a running harness, or is a view (image/page/markdown)
that doesn't accept input, `send` reports an error in the sender's transcript instead of
silently doing nothing — so a scheduled `send` that fails is still visible.

### Profiles

A profile is a reusable set of agents and/or AI harnesses for a particular use case — writing
code, surfing the web, authoring a book, a specific task. Profiles live in a top-level
`profiles/` directory (committable, unlike `.janissary/`). Each profile is its own
dasherized-name directory holding one `<name>.json` file per entry. An agent entry uses the
agent-state schema (the same format as `.janissary/state/<name>.json`); a harness entry is
distinguished by a `harness` key. The filename is the entry's tab label.

```
profiles/
  writing-code/
    builder.json
    reviewer.json
  surfing-the-web/
    scout.json
  small-fix/
    opencode.json
```

A harness entry (`profiles/small-fix/opencode.json`) launches a harness tab directly, optionally
with a model and an initial/recurring schedule:

```json
{
  "harness": "opencode",
  "model": "opencode-go/deepseek-v4-pro",
  "run": ["execute ./ai/fix-a-small-issue.md"],
  "schedule": ["small-fix every 30m execute ./ai/fix-a-small-issue.md"]
}
```

Model ids are validated against the known catalog in `harness-models.json` at the repo root —
add a model there before referencing it in a profile.

`profile launch <name>` opens a tab for each entry in the profile: an agent tab restores its
saved state (command history, transcript, working directory, schedule); a harness tab launches
fresh, with its `run`/`schedule` entries wired up. Relaunching a profile closes any tab whose
label matches an entry (except the tab you launched from) and reopens it fresh. `profile list`
shows the available profiles.

```
profile launch writing-code
profile launch small-fix
profile list
```

### Workspace

Use `-w` (or `--workspace`) on `agent` or `harness` to get a disposable git workspace:

```
agent bilal -w          → agent tab with workspace at .janissary/workspace/bilal/
harness claude -w       → harness tab with workspace at .janissary/workspace/claude/
```

This clones the root repo (detected from the current directory) via `git clone --shared` — no network needed, completes in milliseconds. The shell or harness PTY starts inside the workspace. Make changes, commit, push, then close the tab — the workspace is automatically removed.

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

The `open` command opens a file according to its type. It is a dispatcher: each file type is handled by its own **opener**, so supporting a new type is just a matter of adding one — the command itself never changes. Images and Markdown files are supported today.

```
open <path>            # open the file in the app (images: image tab; .md/.markdown: markdown tab)
open external <path>   # hand the file to the OS viewer
open '*.png'           # a wildcard opens each matching file (up to 10)
```

- **`open <image>`** mounts a new **image tab** showing the image's name, size, and location alongside the image itself. The tab has no command bar; it is named `image` with a close (`×`) button on the tab, and otherwise behaves like any tab — reorder it within its group with `Ctrl+←` / `Ctrl+→`. A landscape image fills the full width; a portrait image fills the remaining height. While an image tab is active: **Page Up / Page Down** (or the scroll wheel) zoom in and out in 10% steps (10%–800%); **arrow keys** pan the view; **click and drag** pans freely; **Escape** resets to 100% and centers. A zoom badge (e.g. `150%`) appears when zoomed. Image tabs are live and in-memory — they are not restored on `--relaunch`.
- **`open external <image>`** launches the file in the operating system's image viewer.
- **`open <file>.md`** / **`open <file>.markdown`** mounts a new **markdown tab** rendering the file as formatted Markdown (headings, lists, tables, fenced code, blockquotes, links) on a white page with dark text. The tab has no command bar; it is named `markdown` with a close (`×`) button on the tab. While a markdown tab is active: **↑ / ↓ arrows** scroll a line; **Page Up / Page Down** scroll a page; the **mouse wheel** scrolls natively. Selecting text highlights it light-blue. Markdown tabs are live and in-memory — they are not restored on `--relaunch`.
- **`open external <file>.md`** hands the file to the operating system's default viewer.
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

A small `connections` panel floats at the top-right of each tab, listing that tab's live connections — its shell, its ACP agent, each AI monitor it started (`monitor:<persona>`), each open browser window (`browser:<id> (<mode>)`), and each `sqlite:<name>` database it has accessed — so opening a connection is reflected there immediately. Monitors are closed with `unmonitor` rather than `connection close`.

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

### AI monitoring (experimental)

A **monitor** is an AI that continuously watches tab activity and offers suggestions. Each monitor is driven by a **persona** — a markdown file in `ai/personas/` that defines its focus (e.g. a security watcher, a pair-programming assistant) — and runs on its own dedicated ACP connection, separate from any interactive `acp` session. Monitors are strictly observational: their sessions have no tool access, so they can only read context and suggest.

```
monitor <persona>                      # inline: watch this tab, suggest in its transcript
monitor <persona> <tab|group:N> ...    # external: watch other tabs/groups, suggest in a reporting tab
monitor ask <persona> <question>       # query a running monitor's AI directly
monitors                               # list active monitors
unmonitor <persona> [target]           # stop a monitor (or drop one target from it)
unmonitor --all                        # stop everything started from this tab
```

**Inline mode** (`monitor security`) watches the current tab and appends suggestions straight into its transcript as `💡 security: …` lines, in the flow of the work they comment on.

**External mode** (`monitor assistant agent2 group:2`) watches the named tabs and/or tab groups (`group:<n>` covers tabs added to the group later) and reports into the persona's own **reporting tab**. Reporting tabs are a second class of tab: they appear in a separate strip **below the command bar** (starting at 1/4 of the action-tab area — drag the divider above the strip to resize; neither area shrinks below 15% of the viewport), take no commands, and carry the color of the tab they monitor. Suggestions appear newest-first; a suggested command renders as a clickable line that runs it in the tab the suggestion is about (the suggestion stays in the feed). Each suggestion has **👍/👎** buttons — the rating is fed back to the monitoring AI on its next batch so it learns what you find useful, and the rated suggestion leaves the feed either way.

Monitors batch their input: transcript entries from the watched tabs accumulate and are sent to the monitoring AI as one prompt every 30 seconds. Quiet tabs cost nothing — if nothing new happened, the AI is not queried at all.

`monitor ask <persona> <question>` puts a question straight to a running monitor's AI — useful for "what have you seen so far?" or "anything I should worry about?". The answer lands in your transcript as a `💡 <persona>: …` reply. Questions share the monitor's single prompt slot, so one that arrives while a batch is streaming reports busy rather than interleaving.

#### Personas

A persona file's **first line** is a required directive naming the ACP harness, model, and variant/effort to run the monitor on; the rest of the file is the monitor's role prompt, fed to the session on startup:

```
[//]: # opencode:DeepSeek V4 Flash:max
[//]: # claude:Sonnet:high
```

Two personas ship in `ai/personas/`: `security` (watches for leaked secrets, risky commands, unsafe patterns) and `assistant` (suggests next steps on the work at hand). Add your own by dropping a new `.md` file there — the filename is the persona name used on the command line.

Active monitors show in the tab's connections panel as `monitor:<persona> (provider/model)` rows and are closed by `unmonitor`, closing the owning tab, or quitting the app. Monitors are session state — they are not restored on `--relaunch`.

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
| `Tab`               | Complete a file path, an agent name for `msg` / `broadcast`, a connection string for `connection close`, a `browser` subcommand / window id, or a `monitor` persona / target |
| `Enter`             | Execute the current command        |
| `Ctrl+C`            | Exit                              |

**Image tab controls** (active only while an image tab is focused):

| Key | Action |
| --- | ------ |
| `Page Up` / scroll-wheel up | Zoom in (10% per step, up to 800%) |
| `Page Down` / scroll-wheel down | Zoom out (10% per step, down to 10%) |
| `↑` / `↓` / `←` / `→` | Pan the image |
| Click and drag | Pan freely |
| `Escape` | Reset zoom to 100% and center the view |

**Markdown tab controls** (active only while a markdown tab is focused):

| Key | Action |
| --- | ------ |
| `↑` / `↓` | Scroll up / down by a line |
| `Page Up` / `Page Down` | Scroll up / down by a page |
| Mouse wheel | Scroll up / down |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the recipient position of `msg` / `broadcast`, active agent names (`broadcast` also offers `all` and completes each entry of a comma-separated list); at the target of `connection close`, the tab's open connection strings (`sqlite:<name>`, `shell:<shell>`, `acp:opencode`, `browser:<id>`); and for the `browser` command, its subcommands (`open`, `goto`, `content`, …) plus the tab's open window ids where one is expected (`browser use`, `browser window close`). For `monitor` / `unmonitor`, the first argument completes against persona names (from `ai/personas/`) and later arguments against tab labels and `group:<n>` tokens (`unmonitor` also offers `--all`).

## Development

```bash
npm start
```

Run tests:

```bash
npm test
```

### Testing

Run all tests (server + client):

```bash
npm test
```

Run tests for a specific project:

```bash
npm run test:server   # Node server tests (src/)
npm run test:client   # React web client tests (web/src/)
npm run test:watch    # watch mode — reruns on file changes
```

### Checking changes

Two commands verify code during development:

**During development** — run after each change for fast feedback:

```bash
npm run check:diff          # lint + typecheck affected projects + related tests (orchestrator)
npm run lint:diff           # lint changed files only
npm run typecheck:diff      # typecheck affected projects (incremental)
npm run test:diff:server    # server tests related to changes
npm run test:diff:web       # web tests related to changes
```

`npm run check:diff` runs the orchestrator, which automatically lints changed files, typechecks affected projects incrementally, and runs tests from the affected area(s):
- Server tests only if `src/` files changed
- Web tests only if `web/src/` files changed  
- Both if changes touch both areas

Completes in seconds. You can also run individual commands above if you want to focus on a specific check.

**At the end of work** — run once when all changes are complete:

```bash
npm run check        # full gate (humans only) — lint all, typecheck all, test all, plus complexity/duplication/dead code
```

This adds CSS linting, code complexity metrics, duplication detection, dead code scanning, the full test suite, and coverage thresholds. **Use `check:diff` dozens of times while working, but run `check` only once, at the very end.** AI developers should never run `check` — leave it for the human to verify before shipping.

### Code Coverage

Generate a merged HTML + LCOV + JSON coverage report:

```bash
npm run coverage
```

Output lands in `coverage/` (gitignored). Open `coverage/index.html` in a browser to browse the interactive report, which breaks down coverage by directory (`src/` vs `web/src/`).

Coverage is enforced with **per-area thresholds** — separate floors for `src/**` (server) and `web/src/**` (client). If a change drops coverage below the recorded floor the run fails. Thresholds are stored in `vitest.config.ts` and ratchet upward automatically (`autoUpdate: true`) whenever a run exceeds them, so the floor can only rise over time.

### Code Quality

Two tools measure code quality: **FTA** (complexity scores per file) and **ESLint sonarjs** (cognitive complexity per function, surfaced inline during lint).

#### Running the report

```bash
npm run quality        # ranked complexity table for src/ and web/src/
npm run quality:gate   # same, but exits non-zero if any file exceeds the score cap
```

Both commands print a score-sorted table for each area:

```
┌──────────────────┬────────────┬─────────────────────┬────────────────────┐
│ File             │ Line count │ FTA score           │ Assessment         │
├──────────────────┼────────────┼─────────────────────┼────────────────────┤
│ controller.ts    │ 815        │ 94.30               │ Needs improvement  │
│ tab.ts           │ 200        │ 60.26               │ Needs improvement  │
│ schedule.ts      │ 183        │ 59.59               │ Could be better    │
└──────────────────┴────────────┴─────────────────────┴────────────────────┘
```

#### Reading the FTA score

| Score | Assessment | Meaning |
| ----- | ---------- | ------- |
| < 50 | OK | Low risk; leave it alone unless you're already in the file. |
| 50–75 | Could be better | Worth decomposing when you next touch it. |
| 75–95 | Needs improvement | Active refactoring target; add tests before changing. |
| > 95 | _(blocked)_ | Exceeds the regression gate — the score cap in `fta.json` prevents scores this high from landing. |

The score combines cyclomatic complexity, Halstead volume, and line count. A high score means the file is both large and branchy — the highest-leverage refactoring targets. `controller.ts` (94.3) is the current outlier; see `docs/quality/` for the full per-file baseline.

#### Regression gate

`fta.json` sets `score_cap: 95`. `npm run quality:gate` exits non-zero if any file's score exceeds it, blocking regressions in CI. Ratchet the cap **down** as high-scoring files are decomposed — the mirror of the coverage threshold ratchet.

#### Complexity warnings in lint

`npm run lint` also reports **cognitive complexity** per function via `eslint-plugin-sonarjs`. Functions above 15 get a `warning` with an exact line number:

```
src/controller.ts
  706:11  warning  Refactor this function to reduce its Cognitive Complexity
                   from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

These are warnings, not errors — they surface during normal development without blocking CI. Resolve them by extracting the flagged function into smaller helpers.

#### Refreshing the baseline

After intentional complexity work, commit an updated snapshot:

```bash
npm run quality:snapshot
```

This rewrites `docs/quality/baseline-server.json` and `docs/quality/baseline-client.json`, which track the per-file trend over time.

### Code Duplication

Detect copy-pasted code blocks across `src/` and `web/src/` with [jscpd](https://github.com/kucherenko/jscpd). Test files are excluded so the metric reflects production duplication only.

```bash
npm run duplication        # print all clones and the overall duplication %
npm run duplication:gate   # same, but exits non-zero if duplication exceeds the threshold
```

#### Reading the output

Each clone block names the two file locations that match:

```
Clone found (typescript)
 - commands/state.ts [11:64 - 34:58]
   state-format.ts [4:57 - 24:115]
```

The summary table at the end shows the total picture:

```
┌────────────┬────────────────┬─────────────┬──────────────┬──────────────┬──────────────────┐
│ Format     │ Files analyzed │ Total lines │ Total tokens │ Clones found │ Duplicated lines  │
├────────────┼────────────────┼─────────────┼──────────────┼──────────────┼──────────────────┤
│ typescript │ 64             │ 5469        │ 42226        │ 12           │ 152 (2.78%)       │
└────────────┴────────────────┴─────────────┴──────────────┴──────────────┴──────────────────┘
```

The **Duplicated lines %** is the key number. Under 3% is acceptable for this codebase; the gate enforces that ceiling.

#### Regression gate

`.jscpd.json` sets `threshold: 3`. `npm run duplication:gate` exits non-zero if the duplication percentage exceeds it, blocking regressions in CI. Ratchet the threshold **down** toward 2% as clones are removed.

Configuration lives in `.jscpd.json`. The minimum clone size is 5 lines / 50 tokens — shorter matches are noise, not duplication.

### CSS Linting

Lint `web/src/theme.css` for correctness with [stylelint](https://stylelint.io) + `stylelint-config-standard`. Prettier already handles formatting; stylelint covers correctness conventions (modern color notation, deprecated property values, etc.).

```bash
npm run lint:css        # check for issues — exits non-zero if any are found
npm run lint:css:fix    # auto-fix what stylelint can fix, then review the diff
```

Configuration lives in `web/.stylelintrc.json`. Purely formatting rules (`declaration-block-single-line-max-declarations`, `*-empty-line-before`) are disabled because the stylesheet uses a deliberate compact single-line style that Prettier preserves.

### Dead Code

Detect unused exports, files, types, and dependencies with [Knip](https://knip.dev). A single scan covers both `src/` and `web/src/`.

```bash
npm run knip        # full scan — exits non-zero if any dead code is found
npm run knip:fix    # auto-remove unused exports, files, and dependencies, then review the diff
```

#### Reading the output

Knip groups findings by category:

```
Unused dependencies (1)
some-package   package.json

Unused files (1)
src/old-feature.ts

Unused exports (3)
helperFn   function   src/utils.ts:12:17
CONSTANT              src/config.ts:5:14

Unused exported types (2)
OldType   type   src/types.ts:42:13
```

Work the categories safest-first: **unused dependencies** → **unused files** → **unused exports/types**.

#### Regression gate

`npm run knip` exits non-zero on any finding. Run it alongside `npm run lint` and `npm run test` to prevent dead code from accumulating. Configuration lives in `knip.json`; suppression (`ignoreDependencies`, `ignoreBinaries`) is the rare exception and each entry has a justifying comment.

### Security Checks

Three automated checks run in `npm run security`: security-focused lint rules, secrets scanning, and dependency CVE auditing. The checks are wired into a **pre-push git hook** so they run automatically before every push.

```bash
npm run security          # lint + secrets + deps (pre-push gate)
npm run security:deps     # npm audit --omit=dev (dependency CVEs)
npm run security:secrets  # gitleaks scan (requires gitleaks: brew install gitleaks)
npm run security:sast     # Opengrep one-time audit → security-audit.sarif (on demand)
```

#### Security lint

`eslint-plugin-security` adds three targeted rules to the existing `npm run lint`:

| Rule | Severity | What it catches |
| ---- | -------- | --------------- |
| `detect-unsafe-regex` | error | Regexes with catastrophic backtracking potential (ReDoS) |
| `detect-eval-with-expression` | error | `eval()` called with a non-literal expression |
| `detect-non-literal-fs-filename` | warning | `fs.*` calls with dynamic (variable) paths — review each hit |

`detect-child-process` is intentionally off: the app's shell/git/glob exec on local-user input is the product, not a vulnerability.

#### Secrets scanning

[gitleaks](https://github.com/gitleaks/gitleaks) scans the working tree and git history for committed credentials. Install it separately (it is a standalone binary — not an npm package):

```bash
brew install gitleaks    # macOS
# or: https://github.com/gitleaks/gitleaks/releases
```

The **pre-commit hook** calls `gitleaks protect --staged` to block newly staged secrets before they land in history. The **pre-push hook** re-runs the full tree scan via `npm run security`.

#### Dependency CVE audit

`npm run security:deps` runs `npm audit --omit=dev` against the lock file. No extra tooling — uses npm's built-in auditing.

#### SAST (on demand)

`npm run security:sast` runs [Opengrep](https://github.com/opengrep/opengrep) (must be installed separately) across `src/` and `web/src/` and writes a SARIF report to `security-audit.sarif`. This is a broad, one-time audit with expected false positives — review the output by hand rather than gating CI on it.

#### Threat model

Severity is driven by trust boundaries, not by how scary the sink looks:

| Source | Trust | Implication |
| ------ | ----- | ----------- |
| Local user typing in their terminal | **Trusted** | Shell/SQL/git exec on user input is the product. |
| ACP agent output rendered in the web client | **Untrusted** | Agent-controlled markdown/HTML; sanitized by DOMPurify. |
| Agent/tab names flowing into file paths | **Semi-trusted** | Validated against `/^[\w-]+$/` before any `path.join`. |
| Anything reachable over the bound port | **Untrusted** | Mitigated by loopback allow-list + session token + CSP headers. |

The ACP tool loop is sandboxed to `db` and `browser` commands — agents cannot invoke shell, `open`, or git clone.

#### Inline suppression

When a lint finding is intentional, suppress it inline with a reason co-located with the code (not in a separate file):

```ts
// Intentional: user-driven shell glob; only the local user reaches this sink.
// eslint-disable-next-line security/detect-child-process
const res = spawnSync(SHELL_NAME, ['-c', expr], { cwd, encoding: 'utf8' });
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

