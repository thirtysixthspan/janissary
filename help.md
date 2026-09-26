### Commands

| Command | Description |
| ------- | ----------- |
| `help` | List available commands |
| `state` | Show agent state fields (truncated) |
| `clear` | Clear the output log |
| `quit` | Exit the application (asks for confirmation) |
| `close` | Close the current tab (exits if last); `close <tabname>` closes a tab by its label (`page`, `page-2`, `image`, …). `exit` is an alias |
| `agent` | Create a new agent tab in a disposable workspace by default (`--no-workspace` opts out; add `--offline` to also deny network access; `on <[user@]host[:path]>` runs it on another machine) |
| `next` | Switch to the next tab |
| `hist` | Open command history picker |
| `tasks` | Open the task picker listing executable `ai/tasks/*.md` files from the project and Janissary (Ctrl+A) |
| `nav` | Open the fuzzy tab navigator (Ctrl+G); `nav <query>` pre-fills the search |
| `msg` | Send a message to another agent |
| `broadcast` | Send a message to several or all agents |
| `question` | `question ask "<question>"` opens a free-text answer panel; `question approve "<question>" <option> …` opens an option-button panel |
| `acp` | Send a prompt to the OpenCode ACP agent (`acp reset` starts a fresh session) |
| `db` | Create, delete, query, or list SQLite databases |
| `browser` | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `open` | Open images/files in a tab, or web pages embedded (`open https://…` / `open page …`) — sites that refuse framing render too; `open external` uses the OS viewer/browser |
| `video` | `video <path>` opens a video through the bundled video tab plugin; accepts the same paths and wildcards as `open` |
| `audio` | `audio <path>` queues audio into the single audio tab through the bundled audio plugin; accepts the same paths and wildcards as `open` |
| `pdf` | `pdf <path>` opens a PDF through the bundled PDF tab plugin; accepts the same paths and wildcards as `open` |
| `plugins` | List bundled tab plugins with their API version, activation state and duration, or disabled reason |
| `conversations` | Open the conversation list; `conversations left`/`right` docks it, and `conversations <title>` opens a saved conversation by title, ignoring case |
| `edit` | Open a file for editing (`edit <file>` or `edit <file>:<line>` to jump to a line) — the plain-text editor for most files, the image editor for an image, the PDF viewer for a PDF |
| `newfile <file>` | Open a new unsaved plain-text file, choosing a free name if needed; Save writes it to disk |
| `newdir <directory>` | Create a directory immediately, choosing a free name if needed; its parent must exist |
| `rename` | Rename the current tab's display name (`rename <name>`); bare `rename` clears the alias |
| `connection` | List or close open connections (sqlite/shell/acp/browser/ssh/terminal) |
| `sessions` | Open the remote sessions list — every host you're connected to or parked on (`sessions left`/`right` to dock it) |
| `schedule` | Run a command later — once or on a recurring schedule |
| `schedules` | Open the aggregated, view-only tab listing every scheduled command across all tabs, through the bundled schedules tab plugin (`schedules left`/`right` to dock it) |
| `profile` | `profile launch <name>` launches a project or built-in Janissary profile (bare `profile launch` opens a source-labeled picker); `profile save <name>` captures the running session in the project; `profile list` lists profiles; `profile validate [name]` checks a profile's structure |
| `harness` | Open an AI coding harness in a disposable workspace; claude and codex auto-approve prompts by default (`--no-workspace` and `--no-auto-approve` opt out; opencode does not auto-approve); `harness capture <name>` snapshots a harness tab's screen into an editor tab; `on <[user@]host[:path]>` runs it on another machine |
| `ssh` | Open an SSH session to a remote host in a full-tab terminal |
| `search` | `search transcript <pattern>` searches the current tab's transcript with a case-insensitive regex (Cmd+F opens it empty); `↑`/`↓` step older/newer, Escape closes |
| `files` | `files [path]` opens a file navigator tab rooted at the issuing tab's cwd, or at `path`; add `with <name\|size\|modified\|permissions>` to show that detail column beside each row |
| `notifications` | `notifications [left\|right]` opens (or docks) the notifications tab — a feed of background-tab events (see `.janissary/config.json` to enable events) |
| `notify` | `notify <message>` pushes a custom line into the notifications feed (dropped if the tab is closed) |
| `send` | Deliver a line of input to any tab — types into a harness, or runs a command in an agent tab |
| `queue` | Queue a command for another agent tab (`queue <agent> <command>`); bare `queue` opens the interactive queue picker (Ctrl+E) |
| `monitor` | Start a persona-driven AI monitor — inline on the current tab, or watching other tabs/groups into a reporting tab |
| `unmonitor` | Stop a monitor by name (`unmonitor <name>`) or all monitors started from this tab (`--all`) |
| `monitors` | List active monitors with their targets and suggestion counts |
| `theme` | Set the application UI theme (`theme <name>`); `theme` alone lists available themes; `theme sync` sets the syntax theme to match the app theme name |
| `syntax` | `syntax theme <name>` sets the editor tab's syntax-highlighting theme (applies to every open editor tab); `syntax theme` alone opens a theme-picker modal |

### Key Bindings

| Key | Action |
| --- | ------ |
| `←` / `→` / `Ctrl+B` / `Ctrl+F` | Move cursor in the input field |
| `↑` / `↓` | Previous / next command in history |
| `Shift+←` / `Shift+→` / `Cmd+Shift+[` / `Cmd+Shift+]` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right |
| `Shift+↑` / `Shift+↓` | Scroll the transcript up / down (accelerated — distance doubles each second) |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down (accelerated) |
| `Page Up` / `Page Down` | Scroll the transcript up / down by half terminal height |
| `Escape` | Reset scroll to bottom |
| `Ctrl+P` / `Ctrl+N` | Scroll the transcript up / down one line (fixed) |
| `Ctrl+R` | Open command history picker |
| `Ctrl+G` | Open the fuzzy tab navigator (also closes it if already open) |
| `Ctrl+E` | Open the queue picker to send a command to another agent tab |
| `Ctrl+A` | Open the task picker (executable `ai/tasks/*.md` files, project and Janissary); Return inserts it into the command line at the cursor without running. Reaches the terminal instead on a shell tab |
| `Ctrl+T` | Expand / collapse agent tool steps in the transcript |
| `Cmd+T` | Open a new agent tab (same as typing `agent`) |
| `Cmd+N` / `Ctrl+N` (conversation list) | Create and open a new conversation |
| `Cmd+F` | Open the search bar in the transcript; in an editor tab, open the fuzzy line search over the buffer |
| `Cmd+P` | Open the Quick Open file finder (fuzzy-match a project file; Return opens it in an editor tab) |
| `Cmd+W` / `Ctrl+W` | Close the current tab (no-op while a picker or any modal dialog is open) |
| `Tab` | Complete a file path, a tab label for `msg` / `broadcast` / `send` / `queue` / `close`, a connection string for `connection close`, a `browser` subcommand / window id, or a `monitor` persona / monitor name / target |
| `Shift+Tab` | Move keyboard focus to the next application section (left → center → right sidebar/panel → reporting), looping; the visible tab in that section gets focus. No-op while a modal dialog is open |
| `Enter` | Execute the current command |
| `Ctrl+C` | Exit |

**Image tab controls** (active only while an image tab is focused):

| Key | Action |
| --- | ------ |
| `Page Up` / scroll-wheel up | Zoom in (10% per step, up to 800%) |
| `Page Down` / scroll-wheel down | Zoom out (10% per step, down to 10%) |
| `↑` / `↓` / `←` / `→` | Pan the image |
| Click and drag | Pan freely |
| `Escape` | Reset zoom to 100% and center the view |
| `Cmd+S` / `Ctrl+S` (while editing) | Save image edits |
| `Escape` (while editing) | End edit mode and return to the viewer |

**Markdown tab controls** (active only while a markdown tab is focused):

| Key | Action |
| --- | ------ |
| `↑` / `↓` | Scroll up / down a short step |
| `Page Up` / `Page Down` | Scroll up / down by a page |
| Mouse wheel | Scroll up / down |

**Audio tab controls** (active only while an audio tab is the visible one):

| Key | Action |
| --- | ------ |
| `Space` | Play / pause |
| `←` / `→` | Seek back / forward ten seconds (clamped to the current track) |
| `Shift+←` / `Shift+→` | Previous / next track |

**Editor tab controls** (active only while an editor tab is focused):

| Key | Action |
| --- | ------ |
| `Cmd+A` / `Ctrl+A` | Select the whole buffer (in a file navigator, select the current row's siblings) |
| `Cmd+C` / `Cmd+X` | Copy / cut the selection |
| `Cmd+S` / `Ctrl+S` | Save the file |
| `Cmd+Z` / `Ctrl+Z` | Undo; add `Shift` to redo |
| `Cmd+←` / `Cmd+→` | Start / end of the line (`Ctrl+A` / `Ctrl+E` in the editor) |
| `Cmd+↑` / `Cmd+↓` | Start / end of the file (`Ctrl+Home` / `Ctrl+End` in the editor) |
| `Ctrl+B` / `Ctrl+F` | Move the cursor one character left / right (`Cmd+F` opens find) |
| `Ctrl+N` / `Ctrl+P` | Move the cursor one visual row down / up |
| `Ctrl+D` | Delete the character after the cursor |
| `Ctrl+K` / `Ctrl+Y` | Delete to the end of the line / paste it back |
| `Cmd+/` | Comment or uncomment the selected lines, or the caret's line |
| `Cmd+]` / `Cmd+[` | Indent / outdent the selected lines by two spaces |
| `Tab` / `Shift+Tab` | Indent a multiline selection / outdent the selected lines |
| `Cmd+D` | Select the word under the caret, then add its next exact occurrence |
| `Cmd+U` | Drop the most recently added selection |
| `Escape` (with multiple selections) | Collapse to the most recently added selection |

**File navigator controls** (active only while a file navigator is focused):

| Key | Action |
| --- | ------ |
| `↑` / `↓` | Move selection to the previous / next visible row |
| `→` | Collapsed directory: expand. Expanded directory: move to its first child. File: no-op |
| `←` | Expanded directory: collapse. Otherwise: move selection to the parent directory |
| `Enter` / `Space` | File: open. Directory: toggle expand/collapse |
| `Shift+Enter` | File: edit it (mirrors Shift+double-click) |
| `Shift+↑` / `Shift+↓` | Extend the selection one row from the anchor (does not wrap) |
| `Cmd+A` / `Ctrl+A` | Select the current row's siblings (every visible row in the same directory) |
| `Home` / `End` | Select the first / last visible row |
| `Page Up` / `Page Down` | Move selection by one viewport of rows |
| Printable characters | Type-ahead: jump to the next visible row whose name starts with what's typed |
| `Cmd+C` / `Ctrl+C` | Copy the selected rows onto the clipboard, and their paths onto the system clipboard as text |
| `Cmd+X` / `Ctrl+X` | Cut the selected rows onto the clipboard |
| `Cmd+V` / `Ctrl+V` | Paste the clipboard into the directory the selection implies |

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the recipient position of `msg` / `broadcast`, every open tab's label (`broadcast` also offers `all` and completes each entry of a comma-separated list); at the target of `connection close`, the same connection strings `connection list` prints (`sqlite:<name>`, `shell:<shell>`, `acp:<provider/model>`, `browser:<id>`, `ssh:<label>`, `terminal:<program>`); and for the `browser` command, its subcommands (`open`, `goto`, `content`, …) plus the tab's open window ids where one is expected (`browser use`, `browser window close`). For `monitor`, the first argument completes against persona names (from `ai/personas/monitor/`); for `unmonitor` and after `monitor ask`, it completes against the names of monitors actually running from this tab, since those arguments address a running monitor rather than choose a persona. Later arguments complete against tab labels and `group:<n>` tokens (`unmonitor` also offers `--all`).
