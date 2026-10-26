### Commands

| Command | Description |
| ------- | ----------- |
| `acp` | Query a core OpenCode ACP connection from a shell or another supported plugin tab; replies stream in the ACP panel (`acp reset` starts a fresh session) |
| `agent` | Run task: [on <host>] [in a tab] [in group <name|id>] [in workspace <label>] [with skill <name>] [using model <id>] [with effort <level>] execute <task> [parameters...] (effort: medium) |
| `audio` | `audio <path>` queues audio into the single audio tab through the bundled audio plugin; accepts the same paths and wildcards as `open` |
| `browser` | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `clear` | Clear the tab's output log; in a shell tab, bare `clear` is sent to zsh so it clears the terminal instead (use `/clear` to clear the output log) |
| `clipboard` | Open the clipboard-history popup: everything copied in this session, newest at the bottom (Ctrl+Shift+V or Cmd+Shift+V); choosing an entry pastes it at the cursor rather than running it |
| `close` | Close the current tab (exits if last); `close <tabname>` closes a tab by its label (`page`, `page-2`, `image`, …) or display alias. `/close` and `/exit` are equivalent |
| `connection` | List or close open connections (sqlite/shell/acp/browser/ssh/terminal) |
| `conversation <title>` | Open a saved conversation by title, ignoring case; if no title matches, create a conversation and send `<title>` as its first query |
| `conversations` | Open the conversation list; `conversations left`/`right` docks it, and `conversations <title>` opens a saved conversation by title, ignoring case |
| `db` | Create, delete, query, or list SQLite databases |
| `diff` | `diff` opens the diff tab on the project's changes versus HEAD; `diff <path>` scopes it to that path's changes; `diff on <tab name>` opens that tab's workspace diff |
| `edit` | Open a file for editing (`edit <file>[:line]`); a bare existing runscript name opens it when no exact file exists |
| `execute` | Run an existing project runscript immediately in the managed system shell (`execute <name>`) |
| `files` | `files [path]` opens a navigator here; `files <path> in <label>` targets another tab. Remote paths use that host's workspace. Add `with <name\|size\|modified\|permissions>` to choose a detail column |
| `harness` | Open an AI coding harness with a disposable workspace and browser. Use `--no-workspace`, `--no-browser`, `--no-auto-approve`, or `--no-auto-resume` to opt out; `capture <name>` saves a screen |
| `help` | List available commands; `help <section>` shows one section, such as `help commands` or `help shell` |
| `hist` | Open command history picker |
| `launcher` | Open or focus the launcher (`launcher right` for the right sidebar). Select a command row and click again to run it, or select a tab row to focus that tab |
| `monitor` | Start a persona-driven AI monitor — inline on the current tab, or watching other tabs/groups into a reporting tab |
| `monitors` | List active monitors with their targets and suggestion counts |
| `nav` | Open the fuzzy tab navigator (Ctrl+G); `nav <query>` pre-fills the search |
| `newdir <directory>` | Create a directory immediately, choosing a free name if needed; its parent must exist |
| `newfile <file>` | Open a new unsaved plain-text file, choosing a free name if needed; Save writes it to disk |
| `next` | Switch to the next tab |
| `notifications` | `notifications [left\|right]` opens or docks notifications; per-type settings control desktop banners and sounds for explicit and opted-in ambient events in `.janissary/config.json` |
| `notify` | `notify <message>` pushes a custom line into the notifications feed |
| `open` | Open images/files in a tab, or web pages embedded (`open https://…` / `open page …`) — sites that refuse framing render too; `open external` uses the OS viewer/browser |
| `pdf` | `pdf <path>` opens a PDF through the bundled PDF tab plugin; accepts the same paths and wildcards as `open` |
| `play` | Play a file in the tab for its type: `play devbox` opens its newest `.cast` recording, `play clip.mp4` opens a video, and `play song.mp3` queues audio |
| `plugins` | List bundled tab plugins with their API version, activation state and duration, or disabled reason |
| `profile` | Use `profile launch <name>` to launch a profile, or bare `profile launch` to pick one. `profile save <name>` saves the session; `profile list` and `profile validate [name]` list or check profiles |
| `question` | `question ask "<question>"` opens a free-text answer panel; `question approve "<question>" <option> …` opens an option-button panel |
| `queue` | Queue a command for a shell or another tab supporting queues (`queue <tab> <command>`); bare `queue` opens the interactive queue picker (Ctrl+E) |
| `quit` | Exit the application (asks for confirmation); `/quit` is equivalent |
| `rename` | Rename the current tab's display name (`rename <name>`); bare `rename` clears the alias |
| `roles` | Open the roles tab, where named roles map to an ordered list of harness/model/effort choices in `roles.json`; bare `roles` only |
| `schedule` | Run a tab command later with `schedule <name> <form> <command>`, or manage project runscripts with `schedule system <name> <form> script <name>` |
| `schedules` | Open the aggregated tab listing every scheduled command across all tabs, through the bundled schedules tab plugin (`schedules left`/`right` to dock it). Its **+** button opens the New schedule dialog |
| `scripts` | Open the project's runscripts in .janissary/scripts. Run, duplicate, or delete one from its row, or create one with **+**. |
| `search` | `search` opens project search; `search <phrase>` searches for a phrase. From a workspaced tab, it searches that workspace. Use `search transcript <pattern>` to search the transcript |
| `send` | Deliver a line to a harness, or submit it through a shell tab's command bar — application commands run in the app and unclaimed lines go to zsh |
| `sessions` | Open the remote sessions list — every host you're connected to or parked on (`sessions left`/`right` to dock it) |
| `shell` | `shell [name] [-w\|--workspace\|--no-workspace] [--offline] [on <address>]` opens a shell with a fresh workspace; `--no-workspace` uses a local shell, and `on <address>` opens a remote shell |
| `sql` | `sql [<name>]` opens a database browser with table filtering, sorting, paging, editing, export, and a SQL console. Bare `sql` opens the most recently used database; add `left` or `right` to dock it |
| `ssh` | Open an SSH session to a remote host in a full-tab terminal |
| `syntax` | `syntax theme <name>` sets the syntax-highlighting theme for every open editor and diff tab; `syntax theme` alone opens a theme-picker modal |
| `tab focus <name>` | Focus the first tab matching its label or alias; explicitly reveals a hidden system tab |
| `tasks` | Open the task picker listing executable `ai/tasks/*.md` files from the project and Janissary (Ctrl+A) |
| `theme` | Set the application UI theme (`theme <name>`); `theme` alone opens a theme-picker modal; `theme sync` sets the syntax theme to match the app theme name |
| `unmonitor` | Stop a monitor by name, remove one target (`unmonitor <name> <target>`), or stop all monitors started from this tab (`--all`) |
| `video` | `video <path>` opens a video through the bundled video tab plugin; accepts the same paths and wildcards as `open` |

Both `shell` and `harness` launches accept `in group <name|id>` to join an existing group by its case-insensitive name or numeric ID. An unknown name creates a group; an unknown positive ID creates that numbered group. Without the clause, the new tab joins the issuing tab's group.

### Key Bindings

**Global key bindings** (work from every tab; where a tab's own controls below take a key, that tab says so):

| Key | Action |
| --- | ------ |
| `Shift+←` / `Shift+→` / `Cmd+Shift+[` / `Cmd+Shift+]` | Switch to the previous / next tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right |
| `Ctrl+R` | Open the command history picker (a shell tab opens its own history instead — see **Shell tab controls**) |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Open the clipboard-history popup (`clipboard`); choosing an entry pastes it at the cursor in the command bar, an editor buffer, or a terminal prompt. `Ctrl+V` and `Cmd+V` are untouched |
| `Ctrl+G` | Open the fuzzy tab navigator (also closes it if already open) |
| `Ctrl+A` | Open the task picker (executable `ai/tasks/*.md` files, project and Janissary); Return inserts it into the command line at the cursor without running. Reaches the terminal instead while a shell tab's terminal holds the keyboard |
| `Cmd+P` | Open the Quick Open file finder (fuzzy-match a project file; Return opens it in an editor tab) |
| `Cmd+Shift+F` | Open or focus the project-wide search tab, scoped to the workspace of the focused tab |
| `Cmd+T` | Open a new shell tab (same as typing `shell`); a shell tab opens another shell instead |
| `Cmd+W` / `Ctrl+W` | Close the current tab (no-op while a picker or any modal dialog is open) |
| `Shift+Tab` | Move keyboard focus to the next application section (left → center → right sidebar/panel → reporting), looping; the visible tab in that section gets focus. No-op while a modal dialog is open. A shell tab keeps the key for its own two surfaces; in an editor tab's text it outdents instead; in a pending question panel it moves backward between its buttons |

**Command bar controls**:

| Key | Action |
| --- | ------ |
| `←` / `→` | Move cursor in the input field |
| `↑` / `↓` | Previous / next command in history |
| `Tab` | Complete a file path, a tab label for `send` / `queue` / `close`, a connection string for `connection close`, a `browser` subcommand / window id, a `monitor` persona / monitor name / target, or the `schedule system` grammar, runscript names, and system schedule names |
| `Enter` | Execute the current command |
| `Ctrl+E` | Open the queue picker for a shell or another tab with a queue and command bar (no-op on tabs without queues) |
| `Ctrl+T` | Expand / collapse ACP tool steps in the response panel |
| `Cmd+F` | Search for a line in an editor buffer |
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
| `Tab` | Complete the line the way any application command bar does; several choices show a strip |
| `Escape` | Close a visible completion strip; otherwise clear text in the focused command line, or return the terminal to the bottom when the line is empty or the terminal has focus |
| `Shift+↑` / `Shift+↓` / `Ctrl+↑` / `Ctrl+↓` | Scroll the terminal up / down (accelerated) |
| `Page Up` / `Page Down` | Scroll the terminal up / down by half a screen |
| `Ctrl+C` / `Ctrl+D` / `Ctrl+Z` | Send interrupt, end-of-input, or suspend to the shell — the characters a terminal would send. `Ctrl+C` copies the command line's own selection instead when it holds one. These apply while the command line has the focus |
| `Ctrl+R` / `hist` | Open this tab's own history: `↑` / `↓` move, Return puts the line back in the command line without running it, Escape closes. Focus another tab and `Ctrl+R` is the application's again |
| `Ctrl+E` / `queue` | Open the queue popup: the selected queued line appears in the command line, typing edits it, Backspace or Delete on an empty line removes it, Escape closes it and clears the line |
| `Ctrl+Shift+C` / `Cmd+C` on macOS (terminal focused) | Copy terminal text or a selected rendered reply to the clipboard and clipboard history |
| `Cmd+T` | Open another shell in the same directory, workspace, and offline mode |
| `Cmd+F` | Does nothing — the terminal has no in-tab transcript to search. **Open transcript** in the metadata row opens the session's text transcript in an editor tab, where `Cmd+F` searches it |

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

`Tab` completes the word at the cursor: filesystem paths against the tab's working directory; at the target of `connection close`, the same connection strings `connection list` prints (`sqlite:<name>`, `shell:<shell>`, `acp:<provider/model>`, `browser:<id>`, `ssh:<label>`, `terminal:<program>`); and for the `browser` command, its subcommands (`open`, `goto`, `content`, …) plus the tab's open window ids where one is expected (`browser use`, `browser window close`). For `monitor`, the first argument completes against persona names (from `ai/personas/monitor/`); for `unmonitor` and after `monitor ask`, it completes against the names of monitors actually running from this tab, since those arguments address a running monitor rather than choose a persona. Later arguments complete against tab labels and `group:<n>` tokens (`unmonitor` also offers `--all`).
