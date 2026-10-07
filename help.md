### Commands

| Command | Description |
| ------- | ----------- |
| `acp` | Send a prompt to the OpenCode ACP agent (`acp reset` starts a fresh session) |
| `agent` | Create a new agent tab in a disposable workspace by default (`--no-workspace` opts out; add `--offline` to also deny network access; `on <[user@]host[:path]>` runs it on another machine) |
| `audio` | `audio <path>` queues audio into the single audio tab through the bundled audio plugin; accepts the same paths and wildcards as `open` |
| `broadcast` | Send a message to several or all agents |
| `browser` | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `clear` | Clear the output log in an agent tab; in a shell tab, clear the terminal (use `/clear` to clear its output log) |
| `clip` | Open the clipboard-history popup: everything copied in this session, newest at the bottom (Ctrl+Shift+V or Cmd+Shift+V); choosing an entry pastes it at the cursor rather than running it |
| `close` | Close the current tab (exits if last); `close <tabname>` closes a tab by its label (`page`, `page-2`, `image`, …) or display alias. `/close` and `/exit` are equivalent |
| `connection` | List or close open connections (sqlite/shell/acp/browser/ssh/terminal) |
| `conversations` | Open the conversation list; `conversations left`/`right` docks it, and `conversations <title>` opens a saved conversation by title, ignoring case |
| `db` | Create, delete, query, or list SQLite databases |
| `edit` | Open a file for editing (`edit <file>` or `edit <file>:<line>` to jump to a line) — the plain-text editor for most files, the image editor for an image, the PDF viewer for a PDF |
| `files` | `files [path]` opens a file navigator tab rooted at the issuing tab's cwd, or at `path`; `files <path> in <label>` targets another tab; remote paths resolve on that host inside its workspace; add `with <name\|size\|modified\|permissions>` to show that detail column beside each row |
| `harness` | Open an AI coding harness in a disposable workspace with an E2E browser attached; claude, opencode, and codex auto-approve prompts by default and opencode and codex also schedule their own resume after a usage limit (`--no-workspace`, `--no-browser`, `--no-auto-approve`, and `--no-auto-resume` opt out); `harness capture <name>` snapshots a harness tab's screen into an editor tab; `on <[user@]host[:path]>` runs it on another machine |
| `help` | List available commands; `help <section>` shows one section, such as `help commands` or `help shell` |
| `hist` | Open command history picker |
| `monitor` | Start a persona-driven AI monitor — inline on the current tab, or watching other tabs/groups into a reporting tab |
| `monitors` | List active monitors with their targets and suggestion counts |
| `msg` | Send a message to another agent |
| `nav` | Open the fuzzy tab navigator (Ctrl+G); `nav <query>` pre-fills the search |
| `newdir <directory>` | Create a directory immediately, choosing a free name if needed; its parent must exist |
| `newfile <file>` | Open a new unsaved plain-text file, choosing a free name if needed; Save writes it to disk |
| `next` | Switch to the next tab |
| `notifications` | `notifications [left\|right]` opens (or docks) the notifications tab; live alerts can also show desktop banners (if browser permission is already granted) and play category sounds for background tabs needing attention. Edit `.janissary/config.json` for event and sound settings |
| `notify` | `notify <message>` pushes a custom line into the notifications feed |
| `open` | Open images/files in a tab, or web pages embedded (`open https://…` / `open page …`) — sites that refuse framing render too; `open external` uses the OS viewer/browser |
| `pdf` | `pdf <path>` opens a PDF through the bundled PDF tab plugin; accepts the same paths and wildcards as `open` |
| `play` | `play <name>` plays a file in the tab that plays its kind — `play devbox` plays the newest `.cast` recording of the session named `devbox`, `play clip.mp4` opens a video, `play song.mp3` queues a track; what plays a file is decided by its extension |
| `plugins` | List bundled tab plugins with their API version, activation state and duration, or disabled reason |
| `profile` | `profile launch <name>` launches a project or built-in Janissary profile (bare `profile launch` opens a source-labeled picker); `profile save <name>` captures the running session in the project; `profile list` lists profiles; `profile validate [name]` checks a profile's structure |
| `question` | `question ask "<question>"` opens a free-text answer panel; `question approve "<question>" <option> …` opens an option-button panel |
| `queue` | Queue a command for another agent or shell tab (`queue <tab> <command>`); bare `queue` opens the interactive queue picker (Ctrl+E) |
| `quit` | Exit the application (asks for confirmation); `/quit` is equivalent |
| `rename` | Rename the current tab's display name (`rename <name>`); bare `rename` clears the alias |
| `schedule` | Run a command later — once or on a recurring schedule |
| `schedules` | Open the aggregated, view-only tab listing every scheduled command across all tabs, through the bundled schedules tab plugin (`schedules left`/`right` to dock it) |
| `search` | `search` opens or focuses the project-wide search tab (Cmd+Shift+F); `search <phrase>` opens it and searches for the phrase; `search transcript <pattern>` searches the current tab's transcript with a case-insensitive regex (Cmd+F opens it empty); `↑`/`↓` step older/newer, Escape closes |
| `send` | Deliver a line to a harness, submit through a shell tab's command bar, or run a command in an agent tab |
| `sessions` | Open the remote sessions list — every host you're connected to or parked on (`sessions left`/`right` to dock it) |
| `sql` | `sql [<name>]` opens a database's browser tab through the bundled SQL tab plugin: filter, sort, page, edit, and export its tables, with a `SQL` console below; bare `sql` opens the database reached most recently, by `sql` or any `db` command (`sql [<name>] left`/`right` to dock it) |
| `ssh` | Open an SSH session to a remote host in a full-tab terminal |
| `syntax` | `syntax theme <name>` sets the editor tab's syntax-highlighting theme (applies to every open editor tab); `syntax theme` alone opens a theme-picker modal |
| `tasks` | Open the task picker listing executable `ai/tasks/*.md` files from the project and Janissary (Ctrl+A) |
| `theme` | Set the application UI theme (`theme <name>`); `theme` alone opens a theme-picker modal; `theme sync` sets the syntax theme to match the app theme name |
| `unmonitor` | Stop a monitor by name (`unmonitor <name>`) or all monitors started from this tab (`--all`) |
| `video` | `video <path>` opens a video through the bundled video tab plugin; accepts the same paths and wildcards as `open` |
| `zsh` | Open a shell tab through the bundled shell tab plugin, named from the agent-name pool like an agent tab: a live zsh terminal with the agent tab's metadata row and command line. The command line has focus when the tab opens; double-click the terminal or press `Shift+Tab` to type directly into zsh, and press `Shift+Tab` again to return to the command line. Double-clicking clears any terminal selection made by the gesture. A single click on the terminal returns focus to the command line. A command-bar line runs as an application command when it names one, and otherwise goes to zsh; prefix it with `!` to force the shell. While zsh is running a command the line reads `queue >`, and a submitted line waits in the tab's command queue until zsh returns to its prompt. `zsh [name] [-w\|--workspace\|--no-workspace] [--offline] [on <address>]`: by default the shell gets a fresh sandboxed workspace clone, as `agent` does, and starts at its root once the clone lands; lines typed meanwhile wait in the queue. `--no-workspace` opens an unsandboxed local shell in the issuing tab's directory, or the project root when that tab is sandboxed. `on <address>` opens a shell with its own remote workspace, even with `--no-workspace`; the tab shows SSH prompts while it provisions, and queued lines run when remote zsh reaches its prompt. Without a repository, a local shell opens unsandboxed and says why. The metadata row's new-shell button and `Cmd+T` open a sibling in the same place and workspace instead. A remote tab refuses `zsh` without `on` because its directory is on the other machine, and refuses a remote shell launch with `Cannot launch a remote shell from a remote tab.` |

### Key Bindings

**Global key bindings** (work from every tab; where a tab's own controls below take a key, that tab says so):

| Key | Action |
| --- | ------ |
| `Shift+←` / `Shift+→` / `Cmd+Shift+[` / `Cmd+Shift+]` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right |
| `Ctrl+R` | Open the command history picker (a shell tab opens its own history instead — see **Shell tab controls**) |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Open the clipboard-history popup (`clip`); choosing an entry pastes it at the cursor in the command bar, an editor buffer, or a terminal prompt. `Ctrl+V` and `Cmd+V` are untouched |
| `Ctrl+G` | Open the fuzzy tab navigator (also closes it if already open) |
| `Ctrl+A` | Open the task picker (executable `ai/tasks/*.md` files, project and Janissary); Return inserts it into the command line at the cursor without running. Reaches the terminal instead in an agent tab whose terminal has taken over |
| `Cmd+P` | Open the Quick Open file finder (fuzzy-match a project file; Return opens it in an editor tab) |
| `Cmd+Shift+F` | Open or focus the project-wide search tab |
| `Cmd+T` | Open a new agent tab (same as typing `agent`); a shell tab opens another shell instead |
| `Cmd+W` / `Ctrl+W` | Close the current tab (no-op while a picker or any modal dialog is open) |
| `Shift+Tab` | Move keyboard focus to the next application section (left → center → right sidebar/panel → reporting), looping; the visible tab in that section gets focus. No-op while a modal dialog is open. A shell tab keeps the key for its own two surfaces; in an editor tab's text it outdents instead; in a pending question panel it moves backward between its buttons |

**Command bar and agent tab controls**:

| Key | Action |
| --- | ------ |
| `←` / `→` | Move cursor in the input field |
| `↑` / `↓` | Previous / next command in history |
| `Tab` | Complete a file path, a tab label for `msg` / `broadcast` / `send` / `queue` / `close`, a connection string for `connection close`, a `browser` subcommand / window id, or a `monitor` persona / monitor name / target |
| `Enter` | Execute the current command |
| `Shift+↑` / `Shift+↓` | Scroll the transcript up / down (accelerated — distance doubles each second) |
| `Ctrl+↑` / `Ctrl+↓` | Scroll the transcript up / down (accelerated) |
| `Page Up` / `Page Down` | Scroll the transcript up / down by half terminal height |
| `Escape` | Reset scroll to bottom |
| `Ctrl+P` / `Ctrl+N` | Scroll the transcript up / down one line (fixed) |
| `Ctrl+E` | Open the queue picker for the current agent or shell tab (no-op on other tabs) |
| `Ctrl+T` | Expand / collapse agent tool steps in the transcript |
| `Ctrl+O` | Move the running command into a full-tab terminal to type to it (no-op when nothing is running) |
| `Cmd+F` | Open the search bar in the transcript; in an editor tab, search for a line in the buffer |
| `Cmd+N` / `Ctrl+N` (conversation list) | Create and open a new conversation |
| `Ctrl+C` | Exit |

**Shell tab controls** (active only while a shell tab is the visible one):

| Key | Action |
| --- | ------ |
| `Shift+Tab` / double-click the terminal | Move between the command line and the terminal; typing in the terminal goes straight to zsh. Double-clicking clears any terminal selection made by the gesture. A single click on the terminal returns focus to the command line |
| `Enter` | Run what is in the command line: an application command when it names one, otherwise sent to zsh. A multi-line command sent to zsh is pasted and submitted as one command. While zsh is running a command the line reads `queue >` and a submitted line waits in the tab's queue |
| `!` prefix | Send the line straight to zsh, even when it names an application command |
| `↑` / `↓` | Walk this tab's command history — lines the command bar sent and commands typed into the terminal |
| `→` / `End` (at the end of input) | Accept the ghost suggestion from the global history |
| `Tab` | Complete the line as the agent tab's bar does; several choices show a strip |
| `Escape` | Close the completion strip when it is showing; otherwise return the terminal to the bottom of its scrollback |
| `Shift+↑` / `Shift+↓` / `Ctrl+↑` / `Ctrl+↓` | Scroll the terminal up / down (accelerated) |
| `Page Up` / `Page Down` | Scroll the terminal up / down by half a screen |
| `Ctrl+C` / `Ctrl+D` / `Ctrl+Z` | Send interrupt, end-of-input, or suspend to the shell — the characters a terminal would send. `Ctrl+C` copies the command line's own selection instead when it holds one. These apply while the command line has the focus |
| `Ctrl+R` / `hist` | Open this tab's own history: `↑` / `↓` move, Return puts the line back in the command line without running it, Escape closes. Focus another tab and `Ctrl+R` is the application's again |
| `Ctrl+E` / `queue` | Open the queue popup: the selected queued line appears in the command line, typing edits it, Backspace or Delete on an empty line removes it, Escape closes it and clears the line |
| `Ctrl+Shift+C` / `Cmd+C` on macOS (terminal focused) | Copy the terminal selection to the clipboard and clipboard history |
| `Cmd+T` | Open another shell in the same directory, workspace, and offline mode |
| `Cmd+F` | Does nothing — a shell tab has no transcript to search |

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

**Asciicast tab controls** (active only while an asciicast tab is the visible one):

| Key | Action |
| --- | ------ |
| `Space` or `p` | Play / pause |
| `.` | Next recorded moment |
| `,` | Previous recorded moment |
| `]` / `[` | Faster / slower |

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
| Window shortcuts | Tab switching, tab moving, `Ctrl+G`, `Ctrl+R`, `Cmd+P` and `Cmd+T` work from the buffer too |

**File navigator controls** (active only while a file navigator is focused):

| Key | Action |
| --- | ------ |
| `↑` / `↓` | Move selection to the previous / next visible row |
| `→` | Collapsed directory: expand. Expanded directory: re-root the tree there. File: open |
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
