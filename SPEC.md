# Janissary — Product Specification

A full-screen terminal UI shell (binary: `janus`) built with Ink v7 + React. Multiple agent tabs, per-tab state, shell execution, and keyboard-driven navigation.

---

## Tabs

Multiple workspace tabs, each with independent state. The `janus` tab is open at startup; additional agent tabs are created on demand.

### Default tab

A single `janus` tab is open on launch with dot color `#5b9cff`. No other tabs exist until explicitly created. When `--relaunch` is used, the saved state may include additional tabs that are all restored.

### Agent tab creation

Running `agent` creates a new tab with a random unused name chosen from a 52-name pool. The name is always lowercased. The new tab is immediately selected (switched to). On `--relaunch`, agent tabs are restored from saved state rather than created manually.

### Named agent tab

`agent <name>` creates a tab with the given name (always lowercased) and selects it immediately.

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

Each tab has its own persistent shell process (spawned via `child_process.spawn`) that runs in the background for the lifetime of the tab. Shell processes are spawned lazily on the first backtick command and kept alive until the tab is closed or the application exits.

### Shell command execution

Backtick-prefixed commands are written to the tab's persistent shell via stdin. The command is wrapped in a subshell with stderr redirected to stdout: `(${cmd}) 2>&1`. A unique delimiter (`echo "__JS_END_<tab>_<timestamp>__"`) is written after the command to mark the end of output.

### Shell output streaming

Output from the shell's stdout and stderr is captured via `data` event listeners. As chunks arrive, the tab's log entry is updated progressively, displaying output line by line as it is produced. When the delimiter is detected, the log entry is finalized (marked not running) and the listeners are removed.

### Shell lifecycle

Shells are created on demand (lazy initialization at first backtick command per tab). On application exit (`quit`/`exit` or Ctrl+C), all shell processes are killed. Shell processes are also killed if the shell process crashes or exits unexpectedly — a new shell is spawned automatically on the next command.

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

### History on return

Pressing Return saves the trimmed input to history before executing.

### Persistence

Command history is persisted per-agent to `.janussary/state/<name>.json`. Each agent state file stores `name`, `dotColor`, `active`, `cmdHistory[]`, `log[]` (the full transcript), and `cwd` (the shell's working directory).

On a normal launch the state directory is cleared before the UI renders, so every session starts fresh.

The `--relaunch` flag skips the state directory cleanup and instead loads all existing agent state files, recreating a tab for each agent with its saved command history, full transcript log, and shell working directory. If no state files are found, a single `janus` tab is created as the default.

---

## Command Set

Built-in commands and the shell execution gateway.

### `help`

Returns the **Commands** and **Key Bindings** sections extracted from `README.md` (parsed and cached on first use). If the README cannot be read, it falls back to a generated summary listing the built-in commands and the `` ` `` / `/` prefixes and `Ctrl+R` history shortcut.

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

Creates a new agent tab with the specified name. See the Tabs section.

### `next`

Programmatically switches to the next tab.

### Shell execution

Any command prefixed with a backtick (`` ` ``) is forwarded to the tab's persistent system shell. See the Window Transcript section.

### `/` built-in prefix

A command may be prefixed with `/` to force it through the built-in command dispatcher (the leading `/` is stripped before matching). This lets a built-in be invoked explicitly even when its name would otherwise collide with a shell command.

### Shell-command auto-run

If an input is not a built-in and its first word matches an enabled entry in the shell-command registry (`src/shell-commands.ts`, ~165 common Unix commands such as `ls`, `grep`, `git` wrappers, etc.), it is run through the shell automatically — no backtick required. This only applies when the built-in lookup returns `Unknown command`.

### Fallback

Commands matched by neither a built-in nor the shell-command registry return `Unknown command: "<cmd>". Type "help" for available commands.`

### Case-insensitive matching

All built-in command names are matched case-insensitively.

### Empty or whitespace input

Empty or whitespace-only input is silently discarded (no log entry, no history entry).

### `dashboard`

Returns `Welcome to the CLI dashboard.`

### `settings`

Returns `Settings panel — no settings yet.`

### `about`

Returns `Custom CLI built with Ink & React.`

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
| PageUp | Scroll transcript up by half terminal height |
| PageDown | Scroll transcript down by half terminal height |
| Escape | Reset scroll to bottom |
| Backspace / Delete | Delete character before cursor |
| (printable) | Insert character at cursor |
| Tab | Ignored |

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

Agent state is stored in `.janussary/state/`. Each agent has one JSON file named `<agent-name>.json` with fields: `name`, `dotColor`, `active`, `cmdHistory[]`, `log[]` (the full transcript of commands and outputs), and `cwd` (the shell working directory after the last command).

On a normal `janus` launch the state directory is recursively deleted before rendering. On `janus --relaunch` the directory is preserved and all agent files are loaded to recreate tabs with their saved command history, transcripts, and working directories.

---

## Launch Modes

### Normal (`janus`)

1. Clear `.janussary/state/` directory.
2. Create a single `janus` tab.
3. Render the UI.

### Relaunch (`janus --relaunch`)

1. Preserve `.janussary/state/` directory.
2. List all `.json` files in the state directory.
3. Create a tab for each agent, assigning dot colors from the palette in order.
4. Load each agent's `cmdHistory` and `log` into its tab, and populate the cwd ref for shell restoration.
5. If no state files exist, fall back to a single `janus` tab.
6. Render the UI with all restored tabs.
7. When a shell is spawned for a restored tab, `cd` to the saved working directory.

---

## Shell Working Directory Persistence

### Per-agent cwd tracking

After each shell command completes, `queryShellPwd` sends `pwd` to the shell and captures the response. The working directory is saved to the agent state file's `cwd` field and kept in a `cwdRef` map keyed by agent label.

### Restoration on relaunch

On `--relaunch`, saved cwd values are loaded from agent state files into `cwdRef`. When `getShell` creates a new shell for a tab, it checks `cwdRef` for the tab's label and sends `cd "<cwd>"` to the shell before any user commands.

### Scope

Only backtick-prefixed shell commands trigger a pwd inquiry. Built-in commands do not affect the working directory.

---

## Tooling and Configuration

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

35 tests across five files using vitest and `ink-testing-library`:
- `src/commands.test.ts` — tests `getOutput` for each built-in command, case insensitivity, empty/whitespace input, unknown commands, and `resolveAgentName` for random selection, provided names (lowercased), duplicate guard, and exhaustion.
- `src/cli.test.tsx` — smoke test verifying initial render shows the `janus` tab, the `Type "help"` placeholder, and the `>` prompt.
- `src/cli.integration.test.tsx` — drives `App` via simulated keystrokes (e.g. `Ctrl+Left`/`Ctrl+Right` tab reordering) against restored `--relaunch` state.
- `src/tab.test.ts` — `tab.ts` helpers: `makeTab`, `flattenBuffer`, history helpers, and `swapTabsLeft`/`swapTabsRight`.
- `src/shell.test.ts` — persistent shell behavior.

### Lint and format

ESLint uses `@eslint/js` recommended, `typescript-eslint` recommended, and `eslint-config-prettier`. Unused-vars is set to error with `argsIgnorePattern: '^_'`. Node globals (`process`, `__dirname`, etc.) are scoped to `.mjs` and `.cjs` files only. `dist/` and `node_modules/` are ignored.

Prettier config: semicolons on, single quotes, trailing commas everywhere, 100 print width, 2-space tab width.

### EditorConfig

Two-space indentation, UTF-8 charset, LF line endings, trim trailing whitespace (disabled for `.md`), insert final newline.

### ESM

The package type is `module`. All source imports use `.js` extensions per NodeNext module resolution (e.g. `import { getOutput } from './commands.js'`).

### .gitignore

Ignored paths: `node_modules/`, `dist/`, `.env`, `.env.*`.
