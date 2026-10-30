# Tab completion

Press `Tab` to complete the token just before the cursor. One match replaces the token, adding `/` for a directory or a space for a file. Several matches fill in their longest common prefix and show the candidates above the command bar. No match leaves the line alone. You can read the candidate strip, but you can't move through it or accept an entry; keep typing to narrow the list, then press `Tab` again.

In a shell tab, a failed completion request reports a shell plugin failure and can close the tab. The typed line isn't guaranteed to survive that failure.

Type `help s`, then press `Tab` to see matching help pages.

## Complete the current token

<img class="agent-float" src="/agents/ahmed-south-west.png" alt="" />

`Tab` completes the token at the cursor, wherever it appears in a command. A command can span several lines: press `Shift+Enter` to add a line, then complete a word on that line. Words on earlier lines still set the command and argument position, so `ls`, `Shift+Enter`, then `do` and `Tab` gives `ls docs/`.

## Command-specific suggestions

| Context | Candidates |
|---|---|
| The target of [`send`](/user-documentation/command-bar/send), [`queue`](/user-documentation/command-bar/queue), `close` / `exit`, or [`schedule … in <tab>`](/user-documentation/automation/scheduling#scheduling-into-another-tab) | Labels and display titles of open tabs, including hidden tabs |
| After `tab`, or at the target of a `tab` subcommand | The eight subcommands, then open tab labels and display titles; names with spaces are quoted |
| After a target in `tab pane` or `tab dock` | `left` and `right` |
| The first argument of `monitor` or `unmonitor` | Monitor persona names and `ask`; current monitor names and `--all` for `unmonitor` |
| `monitor ask <name>` | Names of monitors running from this tab |
| Later target arguments of `monitor` or `unmonitor` | Labels of other action tabs, then `group:<n>` for each action-tab group |
| The target of [`connection close`](/user-documentation/command-bar/connections) | Open connection strings, the same ones `connection list` prints (`sqlite:my-db`, `shell:bash`, `acp:opencode/big-pickle`, `browser:w1`, `ssh:devbox`, `terminal:vim`) |
| After `browser` | Browser subcommands; after `browser use` or `browser window close`, the current tab's open window IDs |
| After `harness <name>`, at `--model` | That harness's known model names; `--model` may appear anywhere after its name |
| After `syntax` or `search` | `theme` then theme names, or `transcript` |
| After `help` | Markdown help page names, including `commands` and `keys` |
| At the first name after `execute`, or a bare `edit` target | Project runscript names; a bare `edit` target also offers matching paths |
| In a `files` command | Matching clause words before paths, tab labels and display titles, detail modes, sidebar sides, and open navigator labels |
| Anywhere else | Filesystem paths relative to the tab's working directory |

Target completion offers both labels and display titles, including hidden tabs. Names that differ only by case appear once, keeping the first spelling in tab order. A `tab` target with spaces is quoted. The other target suggestions are not, so a spaced alias works with `close`, which reads the full target remainder, but not with `send`, `queue`, or `schedule … in <tab>`, which read one whitespace-delimited target token. Use the tab's label with those commands. Monitor target suggestions include hidden action tabs, exclude the current tab and display titles, and list group selectors in ascending order. You can still type a display title as a monitor target.

## Complete paths and clauses

<img class="agent-float left" src="/agents/orhan-south.png" alt="" />

In a `files` command, matching clause words appear before matching paths. The once-only `in`, `on`, and `with` clauses disappear after you use them. View keywords stay available, and bare `left` or `right` is offered only once, before an `in` or `on` clause. `print` appears only as the first word. After `in`, `Tab` offers open tab labels and display titles; after `on`, it offers `left` and `right`; after `with`, it offers `name`, `size`, `modified`, and `permissions`; after `print`, it offers open file-navigator labels. Once you enter the one target for `files print`, `Tab` leaves the line unchanged and does not offer filesystem paths.

After a view clause, paths complete relative to the local working directory named by an earlier `in <label>`, or to the current tab's directory when there is no `in` clause. An unknown or remote `in` target gives no path suggestions and does not fall back to the current directory. A quoted `in` label is decoded for this lookup. Paths and names with spaces or quotes are wrapped in double quotes, with embedded double quotes escaped. An open quote at the cursor leaves the line unchanged; whitespace inside a quoted directory stays in the path token, so `files expand "my dir"/ne` can complete a child there. After a completed quoted path and a space, clause suggestions return.

`help` completes page names only as its first argument. An unmatched prefix or a leading `/` gives no help-page candidates and does not fall through to filesystem completion. Later arguments use the ordinary completion chain.

Run `execute <name>` to execute a project runscript. It offers runscript names only in its first name slot. A bare `edit <name>` combines runscript names with matching paths; a path, file extension, or `:line` target uses filesystem completion, and an exact file target takes precedence over a runscript name.

Path completion lists your home directory for `~` and keeps the tilde in the completed token. A bare `~` works like `~/`, so `ls ~` can complete to `ls ~/projects/`. Dotfiles stay hidden unless the partial name starts with `.`.
