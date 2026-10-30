### Key Bindings

**Global key bindings** (work from every tab; where a tab's own controls below take a key, that tab says so):

| Key | Action |
| --- | ------ |
| `Shift+←` / `Shift+→` / `Cmd+Shift+[` / `Cmd+Shift+]` | Switch to the previous / next tab; no-op with only one eligible center tab |
| `Ctrl+←` / `Ctrl+→` | Move the current tab left / right |
| `Ctrl+R` | Open the command history picker (a shell tab opens its own history instead — see **Shell tab controls**) |
| `Ctrl+Shift+V` / `Cmd+Shift+V` | Open the clipboard-history popup (type `clip` for the same thing); choosing an entry pastes it at the cursor in the command bar, an editor buffer, or a terminal prompt. `Ctrl+V` and `Cmd+V` are untouched |
| `Ctrl+G` | Open the fuzzy tab navigator (also closes it if already open) |
| `Ctrl+A` | Open the task picker (executable `ai/tasks/*.md` files, project and Janissary); Return inserts it into the command line at the cursor without running. Reaches the terminal instead while a shell tab's terminal holds the keyboard |
| `Cmd+P` | Open the Quick Open file finder when the key reaches Janissary; a focused harness or SSH terminal sends it to its program |
| `Cmd+Shift+F` | Open or focus the project-wide search tab when the key reaches Janissary; a focused harness or SSH terminal sends it to its program |
| `Cmd+T` | Open a new shell tab (same as typing `shell`); a shell tab opens another shell instead |
| `Cmd+W` / `Ctrl+W` | Close the current tab (no-op while a picker or any modal dialog is open) |
| `Shift+Tab` | Move keyboard focus to the next application section (left → center → right sidebar/panel → reporting), looping; the visible tab in that section gets focus. No-op while a picker, the clipboard-history popup, or a modal dialog is open. A shell tab keeps the key for its own two surfaces; in an editor tab's text it outdents instead; in a pending question panel it moves backward between its buttons |

**Command bar controls**:

| Key | Action |
| --- | ------ |
| `←` / `→` | Move cursor in the input field |
| `↑` / `↓` | Previous / next command in history |
| `Tab` | Complete file paths; tab targets for `send` / `queue` / `close` / `schedule`; `tab` subcommands, targets, and pane/dock sides; connection strings; `browser` subcommands / window IDs; `monitor` personas, names, and targets; the `schedule system` grammar; `files` clauses and paths; runscript names; system schedule names; and help pages including `commands` and `keys` |
| `Enter` | Execute the current command |
| `Ctrl+E` | Open the queue picker for a shell or another tab with a queue and command bar (no-op on tabs without queues) |
| `Ctrl+T` | Expand / collapse ACP tool steps in the response panel |
| `Cmd+F` | Search for a line in an editor buffer |
| `Cmd+N` / `Ctrl+N` (conversation list) | Create and open a new conversation |
| `Backspace` / `Delete` | Delete the character before / after the cursor |
| Printable characters | Insert at the command cursor |

Within a `files` command, Tab offers matching clause words before paths. The once-only `in`, `on`, and `with` clauses disappear after use; view words remain available, and bare `left` / `right` is offered only once, before `in` or `on`. `print` is offered only as the first word. Tab completes labels and display titles after `in`, sides after `on`, detail modes after `with`, and open navigator labels after `print`. Once the single target of `files print` is entered, Tab leaves the line unchanged and does not fall back to filesystem paths. After a view clause, paths use the local working directory named by `in`, or the current tab's directory when there is no `in`; a remote or unknown target has no path suggestions and does not fall back. A quoted label is decoded for this lookup. Names or paths with spaces or quotes are wrapped in double quotes, with embedded double quotes escaped; nothing completes inside an open quote. Whitespace inside a quoted directory does not stop path completion: `files expand "my dir"/ne` completes a child of `my dir`. After a completed quoted path and a space, clause suggestions return. For example, `files s` can offer `select` and matching paths.

View clauses restore only the named parts of a local tree; remote view clauses are ignored. `files print navigator` prints a reusable command without changing the tree, such as `files on left with size expand src expand src/commands cursor src/commands/files.ts select src/commands/files.ts $root`.

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
| `Ctrl+Shift+C` / `Cmd+C` on macOS | Copy the terminal's selection to the clipboard and clipboard history, from the terminal or the command line. Dragging over output leaves the keyboard in the command line, and the chord copies the selection from there; a selection in the command line itself keeps the chord. Text dragged over in a rendered reply, such as `help`'s, stays highlighted and copies the same way |
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
| `>` (on an empty line) | Open the persona request line; it takes the same editing keys as the buffer, with its own undo history |
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

`Tab` completes the word at the cursor. Target suggestions for `send`, `queue`, `close` / `exit`, and `schedule … in <tab>` include labels and display titles from open tabs, including hidden tabs; case-insensitive duplicates keep their first spelling in tab order. These suggestions leave spaces unquoted. `close` accepts a spaced title because it reads the full target remainder. `send`, `queue`, and `schedule` read one whitespace-delimited target token, so use the label if its title has spaces. The `tab` command quotes spaced targets and offers `left` / `right` after a `pane` or `dock` target.

For `monitor`, the first argument offers monitor persona names and `ask`; `unmonitor` offers names of monitors running from this tab and `--all`. `monitor ask <name>` completes against those running monitor names. Later arguments to `monitor` and `unmonitor` complete against tab labels and `group:<n>` selectors (`unmonitor` also offers `--all`). These target suggestions include hidden action tabs, exclude the current tab and display titles, and list group selectors in ascending order. You can still type a display title as a target. After `help`, the first argument completes from available markdown page names, including `commands` and `keys`. An unmatched prefix or a leading `/` gives no help-page suggestions and does not fall through to filesystem completion; later arguments use the ordinary completion chain.

At the target of `connection close`, Tab offers the same connection strings that `connection list` prints (`sqlite:<name>`, `shell:<shell>`, `acp:<provider/model>`, `browser:<id>`, `ssh:<label>`, `terminal:<program>`). The `browser` command offers its subcommands and, where expected (`browser use`, `browser window close`), the current tab's open window IDs. Filesystem paths complete relative to the tab's working directory.
