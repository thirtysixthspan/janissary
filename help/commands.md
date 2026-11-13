### Commands

| Command | Description |
| ------- | ----------- |
| `agent` | Run task: [on <host>] [in a tab] [in group <name|id>] [in workspace <label>] [with skill <name>] [using model <id>] [with effort <level>] execute <task> [parameters...] (effort: medium) |
| `ask` | Query a core ACP connection using enabled models and native command grants from the `ask` role; the settled Markdown answer appears in shell output (`ask reset` starts fresh) |
| `audio` | `audio <path>` queues audio into the single audio tab through the bundled audio plugin; accepts the same paths and wildcards as `open` |
| `browser` | Drive a headless/headed web browser (open, goto, content, eval, shot) |
| `clear` | Clear the tab's output log; in a shell tab, bare `clear` is sent to zsh so it clears the terminal instead (use `/clear` to clear the output log) |
| `clipboard` | Show session clipboard history with `clip`, Ctrl+Shift+V, or Cmd+Shift+V. Selecting an entry pastes it at the cursor; typing `clipboard` opens this help page |
| `close` | Close the current tab (exits if last); `close <tabname>` closes a tab by label or display alias, and Cancel on its dirty prompt activates that tab. `/close` and `/exit` are equivalent |
| `commands` | Open the Commands tab to enable or disable application commands and control native agent access; `commands enable\|disable [agent\|global] <command>` changes one setting |
| `connection` | Open the connections tab; `connection <text>` opens a live connection or retained session by UUID or full title, and `connection list`/`connection close <connection>` manage live connections |
| `connections` | Open the connections tab; `connections left`/`right` docks it, `connections <text>` looks up a session, and `connections list`/`connections close <connection>` manage live connections |
| `conversation` | Bare `conversation` opens the conversation list; `conversation <title>` opens a saved conversation by title, ignoring case, or creates one and sends `<title>` as its first query |
| `conversations` | Open the conversation list; `conversations left`/`right` docks it, and `conversations <title>` opens a saved conversation by title, ignoring case |
| `db` | Create, delete, query, or list SQLite databases |
| `diff` | `diff` opens the diff tab on the project's changes versus HEAD; `diff <path>` scopes it to that directory's changes; `diff on <tab name>` opens that tab's workspace diff |
| `edit` | Open a file for editing (`edit <file>[:line]`); a bare existing runscript name opens it when no exact file exists |
| `execute` | Run an existing project runscript immediately in the managed system shell (`execute <name>`) |
| `file` | Read a workspace file as numbered lines: `file read <path> [--offset <line>] [--limit <lines>]`, at most 2000 lines per read |
| `files` | `files [path]` opens a tree; `files <path> in <label>` targets another tab (quote labels with spaces or quotes). Remote paths use the host's workspace. `with <name\|size\|modified\|permissions>` sets details; `expand <path>`, `collapse <path>`, `cursor <path>`, `anchor <path>`, and `select <path>` restore view. `files print <tab>` prints a command |
| `harness` | Open an AI coding harness with a disposable workspace and browser. Use `--no-workspace`, `--no-browser`, `--no-auto-approve`, or `--no-auto-resume` to opt out; `capture <name>` saves a screen |
| `help` | `help` lists the commands; `help <command>` shows one command's usage, use cases, and examples; `help keys` lists the key bindings |
| `hist` | Open command history picker |
| `image` | `image <path>` opens an image through the bundled image tab plugin; accepts the same paths and wildcards as `open` |
| `launcher` | Open or focus the launcher (`launcher left` or `launcher right` to choose a sidebar). Select a command row and click again to run it, or select a tab row to focus it |
| `layout` | `layout window <width> <height>`, `layout sidebar left\|right <width>`, `layout split <percent>`, or `layout reporting <percent>` sets a size; `layout show` prints the current ones |
| `models` | Open the model catalog; use `models left` or `models right` to dock it |
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
| `plugins` | Print bundled tab plugin statuses in the transcript, including API version, state, activation time, or disabled reason |
| `profile` | Use `profile launch <name>` to launch a profile, or bare `profile launch` to pick one. `profile list` lists the available profiles |
| `question` | `question ask "<question>"` opens a free-text answer panel; `question approve "<question>" <option> …` opens an option-button panel |
| `queue` | Queue a command for a shell or another tab supporting queues (`queue <tab> <command>`); bare `queue` opens the interactive queue picker (Ctrl+E) |
| `quit` | Exit the application (asks for confirmation); Cancel returns focus to the command bar that submitted it. `/quit` is equivalent |
| `rename` | Rename the current tab's display name (`rename <name>`); bare `rename` clears the alias; in an editor tab, renames the file |
| `roles` | Open the roles tab, where named roles map to harness/model/effort choices and native ACP command grants in `roles.json`; bare `roles` only |
| `schedule` | Run a tab command later with `schedule <name> <form> <command>`, or manage project schedules that run persistent runscripts with `schedule system <name> <form> script <name>` |
| `schedules` | Open the aggregated tab listing every scheduled command across all tabs, through the bundled schedules tab plugin (`schedules left`/`right` to dock it). Its **+** button opens the New schedule dialog |
| `scripts` | Open the project's runscripts in `.janissary/scripts/`, which survive launch cleanup. Run, duplicate, or delete one from its row, or create one with **+**. |
| `search` | `search` opens project search; `search <phrase>` searches for a phrase. From a workspaced tab, it searches that workspace. Use `search transcript <pattern>` to search the transcript |
| `send` | Deliver a line to a harness, or submit it through a shell tab's command bar — application commands run in the app and unclaimed lines go to zsh |
| `sessions` | Open the remote sessions list — every host you're connected to or parked on (`sessions left`/`right` to dock it) |
| `shell` | `shell [name] [-w\|--workspace\|--no-workspace] [--offline] [on <address>]` opens a shell with a fresh workspace; `--no-workspace` uses a local shell, and `on <address>` opens a remote shell |
| `sql` | Open a SQL browser. Bare `sql` opens the most recently connected database; use `sql <name>` to choose one or add `left` or `right` to dock it |
| `ssh` | Open an SSH session to a remote host in a full-tab terminal |
| `syntax` | `syntax theme <name>` sets the syntax-highlighting theme for every open editor and diff tab; `syntax theme` alone opens a theme-picker modal |
| `tab` | `focus <name>`, `move <tab> <position>`, `pane <tab> left\|right`, `split <tab>`, `color <tab> <#rrggbb>`, `group <tab> <id\|name>`, `dock <tab> left\|right`, `undock <tab>` arrange tabs |
| `tasks` | Open the task picker listing executable `ai/tasks/*.md` files from the project and Janissary (Ctrl+A) |
| `tell` | Instruct a core ACP connection using enabled models and native command grants from the `tell` role; the settled Markdown reply appears in shell output (`tell reset` starts fresh) |
| `theme` | Set the application UI theme (`theme <name>`); `theme` alone opens a theme-picker modal; `theme sync` sets the syntax theme to match the app theme name |
| `unmonitor` | Stop a monitor by name, remove one target (`unmonitor <name> <target>`), or stop all monitors started from this tab (`--all`) |
| `video` | `video <path>` opens a video tab, with the same paths and wildcards as `open`; `video snapshot <video> at <time> <file>` saves one frame as an image |

Both `shell` and `harness` launches accept `in group <name\|id>` to join an existing group by its case-insensitive name or numeric ID. An unknown name creates a group; an unknown positive ID creates that numbered group. Without the clause, the new tab joins the issuing tab's group.

A command disabled in the Commands tab is refused wherever it runs. Its picker, command-backed shortcut, or command-bar confirmation does not open or run. An ordinary command-bar line is offered to the server and refused there with `Command is disabled: <command>.`; a disabled `quit` or `close` line is consumed instead and reported to the server, whose existing `command-disabled` notification is its only feedback when the ambient toggle and focus rules allow it. Closing the last tab from `Cmd+W`/`Ctrl+W` or the tab strip still opens the quit confirmation first; confirming dispatches `quit`, which the server refuses when `quit` is disabled.

### commands

Bare `commands` opens the Commands tab, or focuses it when already open, and re-reads the settings file first. The tab lists every application command with an Enabled checkbox and, for native ACP commands, an Agent access checkbox. Changes save immediately; a failed save shows its refusal in the tab and leaves the previous value checked. A command whose parent is disabled shows `Disabled by parent command: <parent>.` and cannot be changed until the parent is enabled; a native command whose parent denies agent access can still be enabled but cannot grant agent access. A row is labeled by its canonical name when that name is one of its forms, or when its first fixed form is another row's name; otherwise it shows its first fixed form, so the builtin `question` row reads `question` while the native `question ask` row reads `question ask`.

`commands enable [agent|global] <command>` and `commands disable [agent|global] <command>` change one setting without opening the tab. The selector defaults to `global`; `agent` changes agent access. Names match canonical names, aliases, and fixed forms exactly, ignoring case and repeated whitespace; trailing words are not ignored. Malformed forms reply `Usage: commands [enable|disable [agent|global] <command>].`, an unknown name replies `Unknown application command: <command>.`, and agent access on a non-native command replies `Not a native ACP command: <canonical>.`

The tab never docks itself; `tab dock` can dock it. The `commands` command can disable itself, and can be re-enabled from its open tab. Once the tab is closed, a disabled `commands` is refused like any other command until the effective `commands.json` file is edited by hand.
