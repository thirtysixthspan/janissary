# Janissary — Product Specification

A full-screen terminal UI shell (binary: `janus`) built with Ink v7 + React. Multiple agent tabs, per-tab state, shell execution, and keyboard-driven navigation.

---

## Tabs

Multiple workspace tabs, each with independent state. The `janus` tab is open at startup; additional agent tabs are created on demand.

### Default tab

A single `janus` tab is open on launch with dot color `#5b9cff`. No other tabs exist until explicitly created. When `--relaunch` is used, the saved state may include additional tabs that are all restored.

### Agent tab creation

Running `agent` creates a new tab with a random unused name chosen from a 52-name pool. The name is always lowercased. The new tab is created in the background — focus stays on the current tab, where an `Agent "<name>" ready.` confirmation is shown. On `--relaunch`, agent tabs are restored from saved state rather than created manually.

### Named agent tab

`agent <name>` creates a tab with the given name (always lowercased). Focus stays on the current tab; switch to the new agent with the arrow keys or `next`.

### Workspace agent tab

`agent <name> --workspace` (or `-w`) creates a tab with a cloned workspace — a `git clone --shared` of the root repository detected from the current directory. The workspace is created at `.janussary/workspace/<name>/` and the agent's shell spawns there. Bare `agent --workspace` picks a random unused name with a workspace.

If no git repository is found from the current directory, an error is shown and no tab is created.

### Workspace lifecycle

Workspace directories are ephemeral:
- **Normal launch**: `.janussary/workspace/` is cleared before rendering.
- **Tab close**: The workspace directory is removed when the tab is closed.
- **App quit**: All workspace directories are removed.
- **`--relaunch`**: Workspace directories are not recreated; restore falls back to the tab's last known working directory.

### Duplicate name rejection

Creating a tab with a name already in use prints `Agent "<name>" is already active.` and does not create a duplicate tab.

### Name exhaustion

When all 52 pool names are used, bare `agent` prints `All agent names are in use.` and creates no tab.

### Tab dot colors

Each tab has a colored dot drawn from a 15-color palette, cycling as tabs are added. The default `janus` tab uses the first palette color.

### Active tab highlight

The active tab shows full-intensity foreground text on the content background color; inactive tabs show muted text on the bar background.

### Tab switching with arrow keys

Shift+Left and Shift+Right arrow keys cycle through open tabs. No-op when only one tab exists. (Unmodified Left/Right move the input cursor; Ctrl+Left/Right reorder the current tab.)

### `next` command

The `next` command programmatically switches to the next tab.

### Per-tab state isolation

Each tab carries its own transcript log, command history (including navigation index), and scroll offset. Switching tabs preserves each tab's state.

---

## Window Transcript

The scrollable output area that displays command inputs and their results. The transcript is stored as structured log entries but rendered as a flat line buffer — each entry is expanded into individual lines (one prompt line + one or more output lines). Scrolling operates on individual lines, not entries.

### Line buffer assembly

Log entries are flattened into a `BufferLine[]` array. Each entry produces one prompt line (`>` + command text). If the entry is in `Running...` state, it produces one running-indicator line. Otherwise, its output text is split by newlines, producing one output line per segment.

### Collapsed agent tool steps

Auto-run agent tool steps (entries flagged `acp`, produced by the ACP tool loop) are **collapsed by default**: `flattenBuffer(log, collapseToolSteps)` replaces each contiguous run of `acp` entries with a single `▸ N tool steps  (ctrl+t to expand)` summary line (a `collapsed` `BufferLine`). Empty continuation turns interspersed in a run are absorbed without breaking it or inflating the count; a visible (non-`acp`) prose turn or message breaks one run into two. The surrounding user prompt and the agent's final answer stay visible.

`Ctrl+T` toggles the per-tab `Tab.toolStepsExpanded` flag (in-memory, like `scrollOffset`, not persisted), resetting scroll to the bottom. When expanded, each step renders as its `+ <command>` line followed by the command's response on the indented output lines beneath it (the `ranCommand` handler stores the command in the entry's `input` and the result in its `output`). Both the render path and the scroll-length calculation pass the same `!toolStepsExpanded` flag to `flattenBuffer`, so scrolling math matches what is drawn.

### Empty state

When a tab has no entries, the placeholder `Type "help" for available commands.` is shown.

### Running indicator

Shell commands in flight show a yellow `Running...` line after the prompt line.

### Auto-scroll on output

New output resets scroll offset to 0 (bottom), showing the latest lines.

### Scroll up

The up arrow increments scroll offset by one line, hiding the newest line and revealing older content further up the buffer.

### Scroll down

The down arrow decrements scroll offset by one line, returning toward the bottom.

### Page scroll

PageUp and PageDown scroll by approximately half the terminal height, measured in lines.

### Scroll wheel

Terminal scroll wheel events scroll the transcript line by line (one line per tick).

### Scrollbar

When scrolled above the bottom, a scrollbar appears in the prompt bar showing a position indicator. The bar displays filled segments (`│` in `faint` color) for scrolled-past content and empty segments (`·`) for remaining content, followed by a percentage. Position is calculated as `scrollOffset / totalBufferLines`.

### Persistent shell per tab

Each tab has its own persistent shell process (spawned via `child_process.spawn`) that runs in the background for the lifetime of the tab. Shell processes are spawned lazily on the first shell command (the `shell` keyword) and kept alive until the tab is closed or the application exits.

### Shell command execution

Shell commands (the `shell` keyword, stripped) are written to the tab's persistent shell via stdin. The command is wrapped in a subshell with stderr redirected to stdout: `(${cmd}) 2>&1`. A unique delimiter (`echo "__JS_END_<tab>_<timestamp>__"`) is written after the command to mark the end of output.

### Shell output streaming

Output from the shell's stdout and stderr is captured via `data` event listeners. As chunks arrive, the tab's log entry is updated progressively, displaying output line by line as it is produced. When the delimiter is detected, the log entry is finalized (marked not running) and the listeners are removed.

### Shell lifecycle

Shells are created on demand (lazy initialization at the first shell command per tab). On application exit (`quit`/`exit` or Ctrl+C), all shell processes are killed. Shell processes are also killed if the shell process crashes or exits unexpectedly — a new shell is spawned automatically on the next command.

### Unmount safety

Shell `data` event listeners check an unmount flag before updating React state. On component unmount, all shell processes are killed and their references are cleared from the shells map.

### Tab-safe async

Shell output uses the tab index captured at execution time via a ref, so output updates are routed to the correct tab's log even if the user switches tabs while a shell command runs.

---

## Command History

Per-tab recall of previously entered commands.

### Per-tab history

Each tab stores its own command history array and navigation index. Switching tabs exposes that tab's history.

### History navigation

The Up arrow walks backward through the history (most recent first). The Down arrow walks forward. Past the newest entry, the input line clears. Each recalled entry is placed on the input line with the cursor at its end.

### History picker

`Ctrl+R` (or the `hist` command) opens an overlay listing the tab's most frequent history entries. Up/Down move the selection, Return runs the selected command, and Escape closes the overlay without running anything. The picker is suppressed when the history is empty.

### Consecutive duplicate suppression

If a command matches the last entry in the tab's history, it is not appended again.

### History cap

History is capped at 100 entries per tab. Older entries beyond the cap are dropped from the front.

---

## Append-only Log

All tab transcript text is recorded in append-only JSON files stored in `.janussary/log/`. The log is written alongside the in-memory tab state and serves as a persistent, chronological record of every session.

### Storage format

One file per day, named `<YYYY-MM-DD>.json`. Each line is a single JSON object representing one content event:

```
{"timestamp":"22:55:20.690","agent":"janus","text":"ls -la"}
```

### Entry fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | Local time when the content was logged, formatted as `HH:MM:SS.mmm` |
| `agent` | string | The label of the tab (agent) where the content appeared |
| `text` | string | The content text (command input, shell output, message text, etc.) |

### Coverage

Both command inputs and their resulting outputs are logged as separate entries, so the log captures the full back-and-forth of each tab session. Messages sent between agents, ACP prompts and responses, and shell command output are all included.

### Log rotation

A new file is created each UTC day. Entries written before midnight go to today's file; entries after midnight go to the next day's file. There is no retention or rotation beyond daily file naming — old files accumulate until manually cleaned.

### Lifecycle

The log directory is initialized at startup (`initLogDir` in `src/logger.ts`) alongside the other `.janussary/` subdirectories. The directory is never cleared. The append-only log is a flat file — no indexing, no compaction.

### History on return

Pressing Return saves the trimmed input to history before executing.

### Persistence

Command history is persisted per-agent to `.janussary/state/<name>.json`. Each agent state file stores `name`, `dotColor`, `active`, `number` (the tab's position), `cmdHistory[]`, `log[]` (the full transcript), `cwd` (the shell's working directory), and `context[]` (informational messages received from other agents).

On a normal launch the state directory is cleared before the UI renders, so every session starts fresh.

The `--relaunch` flag skips the state directory cleanup and instead loads all existing agent state files, recreating a tab for each agent with its saved command history, full transcript log, and shell working directory. If no state files are found, a single `janus` tab is created as the default.

---

## Command Set

Built-in commands and the shell execution gateway.

### `help`

Returns the **Commands** and **Key Bindings** sections extracted from `README.md` (parsed and cached on first use). If the README cannot be read, it falls back to a generated summary listing the built-in commands and the `shell` / `/` prefixes and `Ctrl+R` history shortcut.

### `state`

Reads the agent state file for the current tab from `.janussary/state/<name>.json` and displays each field. Array and object values are JSON-formatted and truncated to the last 10 lines. If no state file exists for the current agent, a message is shown.

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `close`

Closes the current tab: kills its shell, removes it and its in-memory agent state, and selects an adjacent tab. If it is the last remaining tab, the application exits.

### `hist`

Opens the command history picker (same overlay as `Ctrl+R`). See the Command History section.

### `quit` / `exit`

Exits the application gracefully.

### `agent`

Creates a new agent tab with a random unused name from the pool. See the Tabs section.

### `agent <name>`

Creates a new agent tab with the specified name. See the Tabs section. Add `--workspace` (or `-w`) to clone the root repo into a disposable workspace at `.janussary/workspace/<name>/`.

### `next`

Programmatically switches to the next tab.

### `msg` / `broadcast`

`msg <agent> <info|request|command> <text>` sends a message to another agent. Each agent has a FIFO queue processed one message at a time:

- **info** — shown in the recipient's transcript (`● <from>: <text>`, dot and left border in the sender's color) and appended to the recipient's `context[]` state.
- **request** — the recipient displays the incoming request as `● request from <sender>: <command>` (dot and left border in the sender's color), executes it (built-ins, or a `shell`-prefixed shell command — interactive/PTY commands skipped; a bare non-built-in is reported as unknown) capturing its output rather than displaying it, and returns the output to the sender as a **response** message. A response renders as a `● <recipient>:` header followed by the output on its own lines, every line bordered in the recipient's color, and is appended to the sender's `context[]`.
- **command** — run as a raw shell command in the recipient's shell; interactive/PTY commands are skipped.

`broadcast <all|agent[,agent...]> <info|request|command> <text>` sends the same message to multiple agents at once. `all` (or `*`) targets every other agent; a comma-separated list targets a specific set. The sender is always excluded, and the result reports which recipients were reached and any unknown names. The kind accepts the same `i`/`r`/`c` aliases as `msg`.

### `acp`

`acp <prompt>` drives an external [Agent Client Protocol](https://agentclientprotocol.com) agent from the current tab. The agent is hardcoded to OpenCode (`opencode acp`) — no configuration or environment variable is required. With no prompt, `acp` prints `Usage: acp <prompt>.`. See the External ACP Agents section for details.

### `db`

`db sqlite <create|delete|query|list> [name] [sql]` manages SQLite databases (the engine — `sqlite` — is the first parameter). See the Databases section for details. Subcommands:

- `db sqlite create <name>` — create an empty database (reports if it already exists).
- `db sqlite delete <name>` — delete the database file (reports if it does not exist).
- `db sqlite query <name> <sql>` — run SQL; row-returning statements print a table, others report `OK.`.
- `db sqlite list` — list existing database names.

Only the `sqlite` engine is supported; any other engine name is rejected. Database names are validated against `^[A-Za-z0-9_-]+$` (preventing path traversal). Malformed invocations return a `Usage:` message.

### `browser`

`browser <open|list|use|goto|eval|shot|content|close|window close> …` drives a per-tab headless/headed web browser. See the Headless Browser section. Subcommands:

- `browser open [name] [--headed|-H]` — launch this tab's browser (if not running) and open a window; `--headed` requests a visible browser.
- `browser list` — list this tab's windows, marking the current one.
- `browser use <id>` — make a window current.
- `browser goto <url>` — navigate the current window (auto-opens a window if none).
- `browser content` — print the current page's rendered text (truncated).
- `browser eval <js>` — run JavaScript in the page and print the result.
- `browser shot` — screenshot the viewport to a temp PNG and open it in Preview (macOS).
- `browser close [id]` / `browser window close <id>` — close the current window, or a specific window by id (`browser close <id>` is an alias for `browser window close <id>`).

Malformed invocations return a `Usage:` message.

### `connection`

`connection <list|close> [kind:id]` lists or closes open connections. See the Connections section. `connection list` shows every open connection; `connection close <kind>:<id>` closes one, where `<kind>` is `sqlite`, `shell`, `acp`, or `browser`. Malformed invocations return a `Usage:` message.

### Shell execution

Running a shell command **requires** the `shell` keyword: an input beginning with `shell ` is forwarded to the tab's persistent system shell (see the Window Transcript section), with the keyword stripped first. The `shell` match is word-bounded, so `shellcheck …` is not treated as the keyword. There is no bare auto-run and no backtick prefix — a non-built-in typed without the keyword is treated as unknown, so a stray word never reaches the shell.

### `/` built-in prefix

A command may be prefixed with `/` to force it through the built-in command dispatcher (the leading `/` is stripped before matching). This lets a built-in be invoked explicitly even when its name would otherwise collide with a shell command.

### Fallback

A non-built-in without the `shell` keyword returns `Unknown command: "<cmd>". Type "help" for available commands.`

### Case-insensitive matching

All built-in command names are matched case-insensitively.

### Command comments

Before a submitted command is saved to history or executed, `##`-delimited comments are stripped from it by `stripComments` (`src/tab.ts`), applied in `executeRef` (`src/cli.tsx`). A **terminated** comment (`## text ##`) is removed wherever it appears in the line, with the surrounding whitespace collapsed to a single space; an **unterminated** comment (`## text` with no closing `##`) removes everything from `##` to the end. The result is trimmed. For example, `## comment ## clear` and `clear ## comment` both reduce to `clear`. A command stripped to empty falls through to the empty-input rule.

### Empty or whitespace input

Empty or whitespace-only input is silently discarded (no log entry, no history entry). This applies after comment stripping, so a line consisting solely of a comment is discarded.

---

## Keyboard Navigation

The entire UI is keyboard-driven. There is no mouse interaction.

| Key | Action |
|---|---|
| Return | Execute input |
| Ctrl+C | Quit application |
| ← / Ctrl+B | Move input cursor left |
| → / Ctrl+F | Move input cursor right |
| Shift+← | Switch to previous tab (no-op if one tab) |
| Shift+→ | Switch to next tab (no-op if one tab) |
| Ctrl+← | Move the current tab one position left |
| Ctrl+→ | Move the current tab one position right |
| ↑ | Walk backward through command history |
| ↓ | Walk forward through command history |
| Ctrl+↑ / Ctrl+P | Scroll transcript up one line |
| Ctrl+↓ / Ctrl+N | Scroll transcript down one line |
| Ctrl+R | Open command history picker |
| Ctrl+T | Expand / collapse the current tab's agent tool-step runs |
| PageUp | Scroll transcript up by half terminal height |
| PageDown | Scroll transcript down by half terminal height |
| Escape | Reset scroll to bottom |
| Backspace / Delete | Delete character before cursor |
| (printable) | Insert character at cursor |
| Tab | Complete the token at the cursor: a file path, a `msg`/`broadcast` agent name, a `connection close` connection string, or a `browser` subcommand / window id |

---

## Implementation Details

### Color tokens and theming

A `darkTheme` object with the following tokens is defined and applied as the single theme. There is no light theme or theme switching mechanism yet.

| Token | Hex | Usage |
|---|---|---|
| `bg` | `#17181b` | Content area background |
| `bgSoft` | `#26292f` | Tab strip and prompt bar background |
| `fg` | `#e4e5e7` | Primary text |
| `muted` | `#8a8d94` | Inactive tab labels |
| `faint` | `#5b5e66` | Scrollbar indicator text |
| `border` | `#292b30` | Reserved for future border use |
| `accent` | `#5b9cff` | Reserved for future accent use |

### UI chrome

- **Tab strip**: A horizontal bar across the top with `bgSoft` background. Active tab box uses `bg` background to visually blend into the content area.
- **Transcript**: Flex-grows to fill available space. Computes a flat line buffer from structured log entries and renders slices based on `scrollOffset`. Each line is typed as `prompt` (green `>` prefix), `output` (indented), or `running` (yellow).
- **Prompt bar**: Bottom bar with `borderStyle="single"` and `bgSoft` background. Contains a green `>` glyph, the input text, and the cursor. When scrolled above the bottom, a scrollbar indicator is appended to the right side.

### Input cursor

The character under the cursor is rendered in inverse video. When the cursor is at the end of the input (no following character), a space is rendered in inverse to maintain a visible cursor block.

### Agent name pool

The 52 agent names (from `agent-names.json`) are a preset list of lowercase Turkish-origin names: ahmed, akbar, aslan, basir, bekir, bilal, cafer, cahit, cavus, davud, demir, dogan, ekrem, emrah, ersin, farid, fariz, fikri, hakim, hamza, harun, idris, ilyas, imran, jabir, jalal, jamal, kadir, kamil, kasim, latif, lutfi, mahir, malik, murad, omair, orhan, osman, rasim, recep, rifat, sabri, salih, selim, tahir, timur, turan, yahya, yavuz, yusuf.

The file is imported via `import agentNames from '../agent-names.json' with { type: 'json' }`.

### Design assets

A `design/` directory at project root contains reference screenshots (`dark.png`, `light.png`) and a `README.md` with the original UI spec.

### State directory

Agent state is stored in `.janussary/state/`. Each agent has one JSON file named `<agent-name>.json` with fields: `name`, `dotColor`, `active`, `number` (the tab's position in the strip), `cmdHistory[]`, `log[]` (the full transcript of commands and outputs), `cwd` (the shell working directory after the last command), `context[]` (informational messages received from other agents), and `workspaceDir` (path to the agent's disposable workspace clone).

Workspace clones live in `.janussary/workspace/<name>/` and are removed on tab close or app exit.

On a normal `janus` launch the state directory and workspace directory are recursively deleted before rendering. On `janus --relaunch` the directories are preserved and all agent files are loaded to recreate tabs with their saved command history, transcripts, and working directories.

---

## Launch Modes

### Normal (`janus`)

1. Clear `.janussary/state/` directory.
2. Create a single `janus` tab.
3. Render the UI.

### Relaunch (`janus --relaunch`)

1. Preserve `.janussary/state/` directory.
2. List all `.json` files in the state directory.
3. Sort the saved agents by their recorded tab `number` and create a tab for each, preserving its saved `number` and `dotColor`.
4. Load each agent's `cmdHistory` and `log` into its tab, and populate the cwd ref for shell restoration.
5. If no state files exist, fall back to a single `janus` tab.
6. Render the UI with all restored tabs.
7. When a shell is spawned for a restored tab, `cd` to the saved working directory.

### Restored tab order

Each tab's `number` is recorded in its state file and kept in sync as tabs are created, reordered (`Ctrl+←`/`Ctrl+→`), or renumbered. On `--relaunch`, tabs are rebuilt in ascending `number` order and each tab keeps its previously assigned `number` and dot color, so the tab strip reappears exactly as it was left. State files predating this field fall back to array order with palette-assigned colors.

---

## Shell Working Directory Persistence

### Per-agent cwd tracking

After each shell command completes, `queryShellPwd` sends `pwd` to the shell and captures the response. The working directory is saved to the agent state file's `cwd` field and kept in a `cwdRef` map keyed by agent label.

### Restoration on relaunch

On `--relaunch`, saved cwd values are loaded from agent state files into `cwdRef`. When `getShell` creates a new shell for a tab, it checks `cwdRef` for the tab's label and sends `cd "<cwd>"` to the shell before any user commands.

### Scope

Only shell commands (the `shell` keyword) trigger a pwd inquiry. Built-in commands do not affect the working directory.

---

## Databases

SQLite database management via the `db` command (`src/db.ts`), backed by Node's built-in `node:sqlite` module (no external dependency). The underlying connection registry lives in `src/connections.ts` and is shared with the `connection` command (see the Connections section).

### Storage location

Each database is a single file at `.janussary/db/sqlite/<name>.sqlite`. The directory is created on demand. The path base is set at startup via `initDbDir(process.cwd())`.

### Persistence

Unlike `.janussary/state/` and `.janussary/workspace/`, the database directory is **never cleared** — not on normal launch, not on `--relaunch`, not on quit. Databases persist across sessions by design.

### Connection model

Connections are persistent, not per-command. The first `db` command targeting a database opens a `DatabaseSync` connection that is cached in a module-level `Map` keyed by database name and kept open across subsequent commands and tabs. Connections are global (a database is a shared resource, not tab-scoped) and several may be open at once. A connection is closed only by `connection close sqlite:<name>`, by `db delete` (which closes before removing the file), or at app exit (`closeAllConnections`). Because the connection is reused, connection-scoped state — transactions, `TEMP` tables, pragmas — survives between commands. `db create` opens (and lazily creates the file for) a connection; `db query` reuses or opens one; `db delete` closes any open connection first so the file is not locked.

### Name validation

Database names must match `^[A-Za-z0-9_-]+$`. This restricts names to safe filename characters and blocks path traversal (`..`, `/`). Invalid names return `Invalid database name "<name>". …`.

### Engine

Only `sqlite` is accepted as the engine token. Any other engine returns `Unsupported engine "<engine>". Only "sqlite" is supported.`

### Query handling

`db sqlite query <name> <sql>` runs the SQL verbatim (whitespace within the SQL is preserved) on the database's persistent connection:

- **Row-returning statements** — those beginning with `SELECT`, `PRAGMA`, `WITH`, or `EXPLAIN` (case-insensitive) — are executed with a prepared statement and rendered as an aligned text table: a header row, a dashed separator, one row per record, and a trailing `(<n> row[s])` count. A result with no rows renders `(0 rows)`.
- **Other statements** are executed with `exec`, which supports multiple semicolon-separated statements, and report `OK.` on success.
- Errors (bad SQL, missing tables) are caught and returned as `Query error: <message>` without crashing the app.
- Querying or deleting a database that does not exist reports a friendly message rather than failing.

### Experimental-warning suppression

`node:sqlite` emits a one-time `ExperimentalWarning` on first use. Because the app runs in Ink's alternate-screen mode, a stray stderr write would corrupt the display, so a `process.on('warning', …)` listener is registered at startup to swallow that warning (registering any listener also disables Node's default stderr printer).

---

## Headless Browser

The `browser` command drives a real [Playwright](https://playwright.dev) Chromium browser so a tab (or its ACP agent) can fetch web content as a regular user — running JavaScript, navigating, capturing the viewport, and reading rendered text. The command parser lives in `src/browser-command.ts` (`parseBrowserCommand`), the Playwright lifecycle in `src/browser.ts`, and the orchestration in `src/cli.tsx` (`runBrowserInTab`). Playwright is installed as a dependency, driven through `playwright-extra` with `puppeteer-extra-plugin-stealth` for bot-detection resistance (see Bot-detection countermeasures); `postinstall` runs `npx playwright install chromium`.

### One process per tab

Each tab launches its **own** browser process the first time it is used (`launchTabBrowser`), held in `browserRef` keyed by tab index — the same per-tab model as `shellsRef`/`acpRef`, not the global model used by SQLite. Because processes are independent, one tab can run headless while another runs headed at the same time. Playwright primitives map as: **Browser** (one process per tab) → **BrowserContext** (one isolated "window") → **Page** (the viewport).

### Windows

A *window* is a `BrowserContext` plus a single `Page`, with its own cookies/storage (isolation between windows). Windows are addressed by a per-tab counter id (`w1`, `w2`, …); each tab tracks a *current* window. `browser open` opens a new window and makes it current; `browser use <id>` switches; `browser list` lists them with the current one marked `*`. Page actions (`goto`, `eval`, `shot`, `content`) auto-launch the tab's browser (headless) and auto-open a window if the tab has none, so an agent can navigate without managing windows.

### Bot-detection countermeasures

The browser is configured to resemble an ordinary user's browser rather than headless automation. The measures span launch, the plugin layer, and per-window context options:

- **New headless mode.** `launchTabBrowser` launches with `channel: 'chromium'`, selecting Chromium's new headless implementation (a real browser run headless) rather than the legacy headless shell, which exposes obvious tells. The same code path serves headed mode (`headless: false`).
- **Automation flag disabled.** Launch args include `--disable-blink-features=AutomationControlled`, which suppresses the flag that sets `navigator.webdriver` and the automation banner.
- **Stealth plugin.** Chromium is driven through `playwright-extra` with `puppeteer-extra-plugin-stealth` (registered once at module load via `chromium.use(StealthPlugin())`). The plugin patches the common headless tells: `navigator.webdriver`, a missing `window.chrome`, and permissions/plugins/WebGL/`userAgentData` inconsistencies. As belt-and-suspenders, each context also adds an init script forcing `navigator.webdriver` to `false`.
- **Coherent per-window fingerprint.** Each window's `BrowserContext` is created from a `randomBrowserProfile` (`src/user-agent.ts`): a randomized desktop Chrome user agent (platform token varied across Windows / macOS / Linux; the Chrome major version pinned to the **real engine version** read from `browser.version()` so the UA matches the engine-emitted client hints) together with a matching `Sec-CH-UA-Platform` header, an `Accept-Language` header consistent with the chosen `locale`, a platform-plausible `timezoneId`, and a common desktop `viewport`. The point is twofold: isolated windows never share an identical signature, and no exposed field contradicts another (a UA disagreeing with the platform/locale/timezone/client hints is itself a tell).

`randomBrowserProfile`, `randomUserAgent`, and `acceptLanguage` take an injectable `rand` / accept explicit inputs for deterministic testing; `DEFAULT_CHROME_MAJOR` is the fallback version when the real one can't be read.

### Headless vs. headed

The mode is **headless by default**. `browser open --headed` (or `-H`) launches that tab's browser visible. The mode is fixed for the lifetime of the tab's process — `--headed` only takes effect on the call that first launches it; requesting `--headed` against an already-running headless browser returns a notice and the mode is unchanged. To switch modes, close all of the tab's windows (which ends the process) and `browser open` again. Headed mode needs a display; on a headless host the launch fails and the error is surfaced rather than crashing.

### Actions

- `goto <url>` — navigate the current window (waits for load), returning a `title — url` summary.
- `content` — the page's rendered text (title + `body.innerText`), truncated to ~10k chars (the truncation is flagged) so a large page does not overflow an agent prompt.
- `eval <js>` — evaluate JavaScript in the page and return the JSON-stringified result. This is an arbitrary-code surface in the page context; acceptable for a local dev tool.
- `shot` — screenshot the viewport to a PNG in a fresh OS temp directory and, on macOS, open it in Preview via a detached `open -a Preview` (never blocking the render loop); the path is printed. On non-macOS platforms only the path is printed.

Each `browser` command shows a `Running…` entry while the async action completes, then the entry is finalized with the result (mirroring shell/acp).

### Lifecycle and persistence

Closing a tab's last window ends that tab's browser process; `connection close browser:<id>` and `browser close`/`browser window close` share the same `closeBrowserWindow` path. Closing a tab, quitting, and component unmount close every tab's browser. Browser windows are **live and per-tab**, so — like shell/acp and unlike SQLite — they are **not** restored on `--relaunch`; nothing browser-related is written to agent state.

---

## Connections

The `connection` command (parsed by `parseConnectionCommand` in `src/connections.ts`, dispatched in `src/cli.tsx`) inspects and closes the four kinds of long-lived connection the app holds. Each connection is addressed as `<kind>:<id>`.

### Kinds

| Kind | Id | Scope | Backing store |
|---|---|---|---|
| `sqlite` | database name | Global (shared across tabs) | connection registry in `connections.ts` |
| `shell` | shell program basename (`bash`, `zsh`, …) | Current tab | `shellsRef` (keyed by tab index) |
| `acp` | `opencode` | Current tab | `acpRef` (keyed by tab index) |
| `browser` | window id (`w1`, `w2`, …) | Current tab | `browserRef` (keyed by tab index) |

The shell id is derived from `process.env.SHELL` (default `bash`); the acp id is always `opencode` (the hardcoded agent); browser window ids are a per-tab counter.

### `connection list`

Lists all open connections, one per line: the current tab's shell (`shell:<name>`) if a shell is running, the current tab's agent (`acp:opencode`) if connected, the current tab's browser windows (`browser:<id>`), and every open SQLite connection (`sqlite:<name>`, from `listOpenConnections`). When none are open it returns `No open connections.`

### `connection close <kind>:<id>`

- `sqlite:<name>` — closes the database connection via `closeConnection(name)`. Returns `Closed connection sqlite:<name>.` or `No open connection sqlite:<name>.` if none was open. The connection reopens on the next `db` command.
- `shell:<name>` — if `<name>` matches this tab's shell, kills the tab's shell process and clears its busy indicator; the shell respawns (restoring its cwd) on the next shell command. A mismatched or absent shell reports a `No open connection …` message.
- `acp:<name>` — if `<name>` is `opencode`, kills the tab's ACP session and clears its status-popup info; it reconnects on the next `acp` prompt. Otherwise reports `No open connection …`.
- `browser:<id>` — closes that window in the current tab's browser (async; shown via a running entry). Returns `Closed connection browser:<id>.` or `No open connection browser:<id>.`. Closing the tab's last window ends that tab's browser process.

Pressing `Tab` at the target of `connection close` completes against the active tab's open connection strings (its shell, agent, and browser windows plus every open `sqlite:<name>`), so a connection can be closed by completing and running `connection close <string>`.

### Lifecycle integration

Closing a tab kills that tab's shell, ACP, and browser connections (SQLite connections, being global, are untouched). Quitting the app, closing the last tab, and the component-unmount cleanup all additionally close every tab's browser and call `closeAllConnections()` to close every open SQLite connection.

### Validation

A close target must be `<kind>:<id>` with a known kind (`sqlite`, `shell`, `acp`, `browser`) and a non-empty id; otherwise a descriptive error is returned. A bare `connection` or an unrecognized action returns the `Usage:` message.

### Connection window

A small titled `connections` panel (`ConnectionWindow`) floats at the top-right of the active tab, listing that tab's live connections on separate lines: the shell + working directory (`bash:~/dir`) once a shell is running, the ACP agent as `acp:<agent>` (e.g. `acp:opencode`) once connected, each browser window as `browser:<id> (<mode>)`, and `sqlite:<name>` for each database the tab has accessed. The window appears whenever any of these exist. Although SQLite connections are global, each is attributed to the tab(s) that ran a `db` command against it (tracked in `tabDbConns`), so a tab's window reflects the databases it has opened; the list is filtered against the live registry (`isConnectionOpen`), so closing a connection (`connection close sqlite:<name>` or `db sqlite delete`) removes it from the window.

---

## External ACP Agents

A tab can drive an [Agent Client Protocol](https://agentclientprotocol.com) agent via the `acp <prompt>` command. This is an experimental, read-only MVP.

### Hardcoded agent

The agent command is hardcoded to OpenCode: `opencode acp`. There is no configuration or environment variable — `opencode` must be installed, authenticated (`opencode auth login`), and on `PATH`. OpenCode's model is configured via the `OPENCODE_CONFIG_CONTENT` env var passed to the subprocess (currently `opencode/deepseek-v4-flash-free`), and the agent connection is shown as `acp:<agent>` in the tab's status popup.

### Connection lifecycle

Janissary acts as the ACP client: on the first `acp` prompt in a tab it spawns the agent as a subprocess, speaks JSON-RPC over stdio, and reuses the per-tab connection across subsequent prompts. The subprocess inherits the tab's current working directory.

### Reply streaming

The agent reply streams into a running log entry keyed by the prompt text. The text is passed through `formatAgentOutput` (`src/tab.ts`): GitHub-flavored markdown tables (a `|`-delimited header row followed by a `---` separator row) are re-rendered as aligned, box-drawn tables, and the remaining prose — which arrives as one long line with no newlines — is word-wrapped to the transcript's content width (terminal columns minus borders/padding/scrollbar). Rendered table rows are left unwrapped so their columns stay aligned even when wider than the wrap width. While awaiting the agent, the tab's busy indicator flashes. On completion the entry is finalized; empty output renders as `(no output)`.

### Database and browser assistance (autonomous tool loop)

The `db` grammar (`DB_PRIMER` in `src/db.ts`) and the `browser` grammar (`BROWSER_PRIMER` in `src/browser-command.ts`) are both prepended to every user `acp` prompt (but not to the tool-result follow-ups within a loop), so the agent stays aware of the syntax even when a session is reused, and is instructed to end a reply with exactly one command on its own final line when it needs data. `BROWSER_PRIMER` exposes a deliberately simplified surface — `browser goto`, `browser content`, `browser eval` only — and the host handles window/headless/mode management (auto-launching headless and auto-opening a window).

The `acp` handler then drives an autonomous loop (`runAcpToolLoop` in `src/acp-loop.ts`, wired with rendering/execution callbacks in `src/cli.tsx`):

1. The agent's reply streams into a transcript entry (the first turn shows the user's prompt; continuation turns have no prompt line).
2. On completion, the reply is scanned bottom-up (tolerating a code fence or a `$ `/`> ` prefix) for a command: `extractBrowserCommand` first, then `extractDbCommand` (a `browser` command takes precedence when present).
3. If a command is found, it is executed immediately — `runBrowserInTab` for `browser` (async), `runDbInTab`/`runDbCommand` for `db` (sync) — shown in the transcript as its own command entry (input = the command, output = the result), and the output is sent back to the agent as a follow-up prompt asking it to continue or give a final answer. The loop is async-capable: `runCommand` may return a `Promise`, which the loop awaits (a sync command still completes in the same tick).
4. The loop repeats until the agent replies with no command, or a cap of 8 tool steps is reached (a `(stopped after 8 tool steps)` notice is logged in that case).

A freshly connected agent (e.g. OpenCode loading its model on the first prompt) sometimes returns an empty first reply; the loop retries the first turn once — reusing the same transcript entry — before treating an empty reply as a final answer, so the first `acp` request no longer comes back empty.

Only `db` and `browser` commands are auto-run — the agent cannot execute arbitrary shell. `db` is also dispatchable through `runCaptureInTab` (the shared command-capture path used by `msg …request`), which executes a resolved `db` command via `runDbCommand` rather than refusing it as an app command, so a `db` command also works as an inter-agent `request`. (`browser` is not yet offered through that inter-agent path.)

### Scope and limits

This MVP is read-only: tool-permission requests are auto-declined and filesystem/terminal callbacks are not yet offered. With no prompt, `acp` prints `Usage: acp <prompt>.`.

---

## Tooling and Configuration

### Application config

Application settings are stored in `.janussary/config.json`. On first launch a default config is created if the file does not exist. The config is loaded after the `.janussary/` subdirectories are initialized and before the `App` component renders.

| Setting | Type | Default | Description |
| ------- | ---- | ------- | ----------- |
| `transcriptMaxLines` | `number` | `25000` | Maximum number of `LogEntry` objects retained per tab's transcript. When exceeded, the oldest entries are dropped (the most recent N are kept). Applied in both `appendLog` and `updateCurrentTab` so all log mutation paths are capped. |

### Node version

Requires Node 24 (specified in `.nvmrc`).

### Package metadata

- Name: `janissary`
- Version: `1.0.0`
- License: `UNLICENSED`
- Type: `module` (ESM)
- Binary: `janus` (entrypoint at `bin/janus.mjs`)

### Binary entrypoint

`bin/janus.mjs` is a thin ESM shebang script that resolves the compiled output in this priority order:
1. `dist/cli.js` — compiled TypeScript output
2. `tsx` from `node_modules` — direct invocation for development
3. `npx tsx` — global fallback

### TypeScript build

Compiled with `tsc` targeting ES2023 with NodeNext module resolution. Source in `src/`, output in `dist/`. JSX uses `react-jsx` transform. Strict mode enabled. Tests excluded from compilation.

### Test suite

229 tests across 23 files using vitest and `ink-testing-library`. Highlights:
- `src/commands.test.ts` — `getOutput` for each built-in, case insensitivity, empty/whitespace input, unknown commands, and `resolveAgentName` (random selection, provided names lowercased, duplicate guard, exhaustion).
- `src/resolve.test.ts` — `resolveCommand` classification (shell/app/output/empty), including `db`/`browser`/`connection` routing, the `shell` keyword (with word-boundary handling so `shellcheck` is not the keyword), and that bare command names and backtick-prefixed input are reported as unknown rather than run in the shell.
- `src/db.test.ts` — `parseDbCommand` (engine-first word order, quoted-SQL unwrapping, name validation, usage hints), `runDbCommand` lifecycle (create/list/query/delete, persistent connections, TEMP-table persistence, errors), and `extractDbCommand`.
- `src/browser-command.test.ts` — `parseBrowserCommand` for every action (including `--headed`/`-H` and argument-preserving `goto`/`eval`) and its usage errors, plus `extractBrowserCommand`.
- `src/browser.test.ts` — live `TabBrowser` against a `data:` URL (`goto`/`eval`/`content`, randomized user-agent override, masked automation tells — `navigator.webdriver` off and `window.chrome` present — window isolation, close); skipped when the chromium binary is unavailable.
- `src/user-agent.test.ts` — `randomBrowserProfile`/`randomUserAgent`/`acceptLanguage`: UA shape, version pinned to the given major, internal consistency (UA token ↔ platform hint), deterministic output under an injected `rand`, and variation across instances.
- `src/connections.test.ts` — `parseConnectionCommand` for each kind (including `browser`) and its error cases.
- `src/acp-loop.test.ts` — `runAcpToolLoop`: runs an extracted command and feeds the output back, awaits an async `runCommand`, prepends the primer only on the first turn, stops on a final answer, caps at `maxSteps`, and surfaces errors.
- `src/tab.test.ts` — `tab.ts` helpers: `makeTab`, `flattenBuffer`, `wordWrap`, history helpers, `swapTabsLeft`/`swapTabsRight`, `stripComments` (terminated, unterminated, and mid-command `##` comments), and `formatMarkdownTables`/`formatAgentOutput` (markdown tables rendered as aligned box tables, prose wrapped around them).
- `src/config.test.ts` — config file creation, reading, missing-field defaults, parse-error fallback.
- `src/logger.test.ts` — log directory init, JSON-line appending, daily file name, special characters.
- `src/cli.test.tsx`, `src/cli.integration.test.tsx`, `src/cli.relaunch.test.tsx` — render smoke test, simulated-keystroke integration (e.g. `Ctrl+Left`/`Ctrl+Right` tab reordering), and `--relaunch` restore.
- Plus `completion`, `config`, `interactive`, `messaging`(+hook), `scroll`, `shell`, `useInputHandler`, and `workspace` suites.

### Lint and format

ESLint uses `@eslint/js` recommended, `typescript-eslint` recommended, and `eslint-config-prettier`. Unused-vars is set to error with `argsIgnorePattern: '^_'`. Node globals (`process`, `__dirname`, etc.) are scoped to `.mjs` and `.cjs` files only. `dist/` and `node_modules/` are ignored.

Prettier config: semicolons on, single quotes, trailing commas everywhere, 100 print width, 2-space tab width.

### EditorConfig

Two-space indentation, UTF-8 charset, LF line endings, trim trailing whitespace (disabled for `.md`), insert final newline.

### ESM

The package type is `module`. All source imports use `.js` extensions per NodeNext module resolution (e.g. `import { getOutput } from './commands.js'`).

### .gitignore

Ignored paths: `node_modules/`, `dist/`, `.env`, `.env.*`.
