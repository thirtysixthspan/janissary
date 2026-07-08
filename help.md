### Commands

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `help`       | List available commands            |
| `state`      | Show agent state fields (truncated) |
| `clear`      | Clear the output log               |
| `quit`       | Exit the application (asks for confirmation) |
| `close`      | Close the current tab (exits if last); `close page #` closes a numbered page tab. `exit` is an alias |
| `agent`      | Create a new agent tab (add `--workspace` to clone the repo, isolated by default — see Workspace; add `--offline` to also deny network access) |
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
| `ssh`        | Open an SSH session to a remote host in a full-tab terminal |
| `search`     | `search transcript <pattern>` searches the current tab's transcript with a regex (Cmd+F opens it empty) |
| `files`      | `files [path]` opens a file tree tab rooted at the issuing tab's cwd, or at `path` |
| `send`       | Deliver a line of input to any tab — types into a harness, or runs a command in an agent tab |
| `monitor`    | Start a persona-driven AI monitor — inline on the current tab, or watching other tabs/groups into a reporting tab |
| `unmonitor`  | Stop a monitor (`unmonitor <persona>`) or all monitors started from this tab (`--all`) |
| `monitors`   | List active monitors with their targets and suggestion counts |
| `syntax`     | `syntax theme <name>` sets the editor tab's syntax-highlighting theme (applies to every open editor tab); `syntax theme` alone opens a theme-picker modal |

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

**File tree tab controls** (active only while a file tree tab is focused):

| Key | Action |
| --- | ------ |
| `↑` / `↓` | Move selection to the previous / next visible row |
| `→` | Collapsed directory: expand. Expanded directory: move to its first child. File: no-op |
| `←` | Expanded directory: collapse. Otherwise: move selection to the parent directory |
| `Enter` / `Space` | File: open. Directory: toggle expand/collapse |
| `Alt+Enter` | File: open in the plain-text editor (mirrors Alt+click) |
| `Home` / `End` | Select the first / last visible row |
| `Page Up` / `Page Down` | Move selection by one viewport of rows |
| Printable characters | Type-ahead: jump to the next visible row whose name starts with what's typed |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the recipient position of `msg` / `broadcast`, active agent names (`broadcast` also offers `all` and completes each entry of a comma-separated list); at the target of `connection close`, the tab's open connection strings (`sqlite:<name>`, `shell:<shell>`, `acp:opencode`, `browser:<id>`); and for the `browser` command, its subcommands (`open`, `goto`, `content`, …) plus the tab's open window ids where one is expected (`browser use`, `browser window close`). For `monitor` / `unmonitor`, the first argument completes against persona names (from `ai/personas/`) and later arguments against tab labels and `group:<n>` tokens (`unmonitor` also offers `--all`).
