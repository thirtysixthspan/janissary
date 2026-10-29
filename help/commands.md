### Commands

| Command | Description |
| ------- | ----------- |
| `acp` | Query a core OpenCode ACP connection from a shell or another supported plugin tab; replies stream in the ACP panel (`acp reset` starts a fresh session) |
| `agent` | Run task: [on <host>] [in a tab] [in group <name|id>] [in workspace <label>] [with skill <name>] [using model <id>] [with effort <level>] execute <task> [parameters...] (effort: medium) |
| `audio` | `audio <path>` queues audio into the single audio tab through the bundled audio plugin; accepts the same paths and wildcards as `open` |
| `browser` | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `clear` | Clear the tab's output log; in a shell tab, bare `clear` is sent to zsh so it clears the terminal instead (use `/clear` to clear the output log) |
| `clipboard` | Show session clipboard history with `clip`, Ctrl+Shift+V, or Cmd+Shift+V. Selecting an entry pastes it at the cursor; typing `clipboard` opens this help page |
| `close` | Close the current tab (exits if last); `close <tabname>` closes a tab by its label (`page`, `page-2`, `image`, …) or display alias. `/close` and `/exit` are equivalent |
| `connection` | List or close open connections (sqlite/shell/acp/browser/ssh/terminal) |
| `conversation` | Bare `conversation` opens the conversation list; `conversation <title>` opens a saved conversation by title, ignoring case, or creates one and sends `<title>` as its first query |
| `conversations` | Open the conversation list; `conversations left`/`right` docks it, and `conversations <title>` opens a saved conversation by title, ignoring case |
| `db` | Create, delete, query, or list SQLite databases |
| `diff` | `diff` opens the diff tab on the project's changes versus HEAD; `diff <path>` scopes it to that directory's changes; `diff on <tab name>` opens that tab's workspace diff |
| `edit` | Open a file for editing (`edit <file>[:line]`); a bare existing runscript name opens it when no exact file exists |
| `execute` | Run an existing project runscript immediately in the managed system shell (`execute <name>`) |
| `files` | `files [path]` opens a tree; `files <path> in <label>` targets another tab (quote labels with spaces or quotes). Remote paths use the host's workspace. `with <name\|size\|modified\|permissions>` sets details; `expand <path>`, `collapse <path>`, `cursor <path>`, `anchor <path>`, and `select <path>` restore view. `files print <tab>` prints a command |
| `harness` | Open an AI coding harness with a disposable workspace and browser. Use `--no-workspace`, `--no-browser`, `--no-auto-approve`, or `--no-auto-resume` to opt out; `capture <name>` saves a screen |
| `help` | `help` lists the commands; `help <command>` shows one command's usage, use cases, and examples; `help keys` lists the key bindings |
| `hist` | Open command history picker |
| `launcher` | Open or focus the launcher (`launcher right` for the right sidebar). Select a command row and click again to run it, or select a tab row to focus that tab |
| `layout` | `layout window <width> <height>`, `layout sidebar left\|right <width>`, `layout split <percent>`, or `layout reporting <percent>` sets a size; `layout show` prints the current ones |
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
| `profile` | Use `profile launch <name>` to launch a profile, or bare `profile launch` to pick one. `profile list` lists the available profiles |
| `question` | `question ask "<question>"` opens a free-text answer panel; `question approve "<question>" <option> …` opens an option-button panel |
| `queue` | Queue a command for a shell or another tab supporting queues (`queue <tab> <command>`); bare `queue` opens the interactive queue picker (Ctrl+E) |
| `quit` | Exit the application (asks for confirmation); `/quit` is equivalent |
| `rename` | Rename the current tab's display name (`rename <name>`); bare `rename` clears the alias; in an editor tab, renames the file |
| `roles` | Open the roles tab, where named roles map to an ordered list of harness/model/effort choices in `roles.json`; bare `roles` only |
| `schedule` | Run a tab command later with `schedule <name> <form> <command>`, or manage project runscripts with `schedule system <name> <form> script <name>` |
| `schedules` | Open the aggregated tab listing every scheduled command across all tabs, through the bundled schedules tab plugin (`schedules left`/`right` to dock it). Its **+** button opens the New schedule dialog |
| `scripts` | Open the project's runscripts in .janissary/scripts. Run, duplicate, or delete one from its row, or create one with **+**. |
| `search` | `search` opens project search; `search <phrase>` searches for a phrase. From a workspaced tab, it searches that workspace. Use `search transcript <pattern>` to search the transcript |
| `send` | Deliver a line to a harness, or submit it through a shell tab's command bar — application commands run in the app and unclaimed lines go to zsh |
| `sessions` | Open the remote sessions list — every host you're connected to or parked on (`sessions left`/`right` to dock it) |
| `shell` | `shell [name] [-w\|--workspace\|--no-workspace] [--offline] [on <address>]` opens a shell with a fresh workspace; `--no-workspace` uses a local shell, and `on <address>` opens a remote shell |
| `sql` | Open a SQL browser. Bare `sql` opens the most recently connected database; use `sql <name>` to choose one or add `left` or `right` to dock it |
| `ssh` | Open an SSH session to a remote host in a full-tab terminal |
| `syntax` | `syntax theme <name>` sets the syntax-highlighting theme for every open editor and diff tab; `syntax theme` alone opens a theme-picker modal |
| `tab` | `focus <name>`, `move <tab> <position>`, `pane <tab> left\|right`, `split <tab>`, `color <tab> <#rrggbb>`, `group <tab> <id\|name>`, `dock <tab> left\|right`, `undock <tab>` arrange tabs |
| `tasks` | Open the task picker listing executable `ai/tasks/*.md` files from the project and Janissary (Ctrl+A) |
| `theme` | Set the application UI theme (`theme <name>`); `theme` alone opens a theme-picker modal; `theme sync` sets the syntax theme to match the app theme name |
| `unmonitor` | Stop a monitor by name, remove one target (`unmonitor <name> <target>`), or stop all monitors started from this tab (`--all`) |
| `video` | `video <path>` opens a video through the bundled video tab plugin; accepts the same paths and wildcards as `open` |

Both `shell` and `harness` launches accept `in group <name|id>` to join an existing group by its case-insensitive name or numeric ID. An unknown name creates a group; an unknown positive ID creates that numbered group. Without the clause, the new tab joins the issuing tab's group.
