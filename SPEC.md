# Janissary — Product Specification

A full-screen terminal UI shell (binary: `janus`) built with Ink v7 + React. Multiple agent tabs, per-tab state, shell execution, and keyboard-driven navigation.

---





---

## Command Set

Built-in commands and the shell execution gateway.

### `help`

Returns the **Commands** and **Key Bindings** sections extracted from `README.md` (parsed and cached on first use). If the README cannot be read, it falls back to a generated summary listing the built-in commands and the `shell` / `/` prefixes and `Ctrl+R` history shortcut.

### `state`

Reads the agent state file for the current tab from `.janissary/state/<name>.json` and displays each field. Array and object values are JSON-formatted and truncated to the last 10 lines. If no state file exists for the current agent, a message is shown.

### `clear`

Empties the current tab's transcript log. Other tabs are unaffected.

### `close`

Closes the current tab and all of its associated connections — its shell, ACP session, browser, harness/interactive terminals, and scheduled timers — removes any workspace clone and its in-memory agent state, and selects an adjacent tab. `close` is reserved for closing tabs (not exiting the app). Closing the last remaining tab opens a fresh `janus` tab, exactly as on launch. (Open SQLite connections are global, not tab-scoped, so they are left open — close them with `connection close sqlite:<name>`.)


### `quit` / `exit`

Exits the application: closes the app window (the web page) and stops the server, after killing every tab's shell, ACP session, browser, and terminals and closing all connections. `exit` is an alias of `quit`. (To close a single tab, use `close`.)


### `next`

Programmatically switches to the next tab.




### Shell execution

Running a shell command **requires** the `shell` keyword: an input beginning with `shell ` is forwarded to the tab's persistent system shell (see the Window Transcript section), with the keyword stripped first. The `shell` match is word-bounded, so `shellcheck …` is not treated as the keyword. There is no bare auto-run and no backtick prefix — a non-built-in typed without the keyword is treated as unknown, so a stray word never reaches the shell.


### Fallback

A non-built-in without the `shell` keyword returns `Unknown command: "<cmd>". Type "help" for available commands.`

### Case-insensitive matching

All built-in command names are matched case-insensitively.


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


### Design assets

A `design/` directory at project root contains reference screenshots (`dark.png`, `light.png`) and a `README.md` with the original UI spec.



---

## Launch Modes

### Normal (`janus`)

1. Clear `.janissary/state/` directory.
2. Create a single `janus` tab.
3. Render the UI.

### Relaunch (`janus --relaunch`)

1. Preserve `.janissary/state/` directory.
2. List all `.json` files in the state directory.
3. Sort the saved agents by their recorded tab `number` and create a tab for each, preserving its saved `number` and `dotColor`.
4. Load each agent's `cmdHistory` and `log` into its tab, and populate the cwd ref for shell restoration.
5. If no state files exist, fall back to a single `janus` tab.
6. Render the UI with all restored tabs.
7. When a shell is spawned for a restored tab, `cd` to the saved working directory.

### Restored tab order

Each tab's `number` is recorded in its state file and kept in sync as tabs are created, reordered (`Ctrl+←`/`Ctrl+→`), or renumbered. On `--relaunch`, tabs are rebuilt in ascending `number` order and each tab keeps its previously assigned `number`, dot color, and group (`group` number and `groupColor` bar color), so the tab strip — including its group bands — reappears exactly as it was left. State files predating these fields fall back to array order with palette-assigned colors and group 1.

---

## Shell Working Directory Persistence

### Per-agent cwd tracking

After each shell command completes, `queryShellPwd` sends `pwd` to the shell and captures the response. The working directory is saved to the agent state file's `cwd` field and kept in a `cwdRef` map keyed by agent label.

### Restoration on relaunch

On `--relaunch`, saved cwd values are loaded from agent state files into `cwdRef`. When `getShell` creates a new shell for a tab, it checks `cwdRef` for the tab's label and sends `cd "<cwd>"` to the shell before any user commands.

### Scope

Only shell commands (the `shell` keyword) trigger a pwd inquiry. Built-in commands do not affect the working directory.




### Scope and limits

This MVP is read-only: tool-permission requests are auto-declined and filesystem/terminal callbacks are not yet offered. With no prompt, `acp` prints `Usage: acp <prompt>.`.

---

## Tooling and Configuration

### Application config

Application settings are stored in `.janissary/config.json`. On first launch a default config is created if the file does not exist. The config is loaded after the `.janissary/` subdirectories are initialized and before the `App` component renders.

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
