# Tab completion

<img class="agent-float" src="/agents/ahmed-south-west.png" alt="" />

Press `Tab` to complete the token just before the cursor. One match replaces the token outright — with a trailing `/` for a directory or a space for a file. Several matches fill in their longest common prefix and list the candidates above the command bar; no match does nothing. That list of candidates is there to be read, not chosen from: there is no key that moves through it and no way to accept one, so keep typing to narrow the token down and press `Tab` again when the answer is what you have.

A command can run over more than one line. Press `Shift+Enter` to add a line and keep going, and `Tab` completes the word on whichever line the cursor is sitting on. The words on the earlier lines still decide what you are completing, so `ls`, `Shift+Enter`, then `do` and `Tab` gives `ls docs/`..

What gets completed depends on where in the command you are:

| Context | Candidates |
|---|---|
| The target of [`send`](/user-documentation/command-bar/send), [`queue`](/user-documentation/command-bar/queue), or `close` / `exit` | Every open tab's label or display alias |
| The tab in a [`schedule … in <tab>`](/user-documentation/automation/scheduling#scheduling-into-another-tab) clause | Every open tab's label or display alias |
| After `tab`, or at the target of a `tab` subcommand | The eight subcommands, then every open tab's label or display alias; names with spaces are quoted |
| After a target in `tab pane` or `tab dock` | `left` and `right` |
| The target of [`connection close`](/user-documentation/command-bar/connections) | Open connection strings, the same ones `connection list` prints (`sqlite:my-db`, `shell:bash`, `acp:opencode/big-pickle`, `browser:w1`, `ssh:my-host`, `terminal:vim`) |
| After `browser` | Browser subcommands; for those that take a window id (`browser use`, `browser window close`), the current tab's open window ids |
| After `harness <name>`, at `--model` | That harness's known model names; `--model` may sit anywhere after the harness name |
| After `syntax` | `theme` at the first argument, and the available theme names after it |
| After `search` | `transcript`, its only subcommand |
| After `help` | Help page names, including `commands` and `keys` |
| After `execute`, or a bare `edit` target | Existing project runscript names; bare `edit` also lists matching files |
| In a `files` command | Clause words, tab labels, detail modes, sidebar sides, and matching paths; clause paths use the local root named by `in <tab>` when available |
| Anywhere else | Filesystem paths, relative to the tab's working directory |

Path completion lists your home directory for `~` and leaves the tilde in the token it writes back, so `ls ~/pro` and `Tab` gives `ls ~/projects/` when there is one match. A bare `~` works the same as `~/`: `ls ~` and `Tab` offers what's in your home directory rather than in the folder above it. Dotfiles stay hidden unless what you've typed already starts with a `.`.

In a `files` command, matching clause words appear before matching paths when either could go next. The once-only `in`, `on`, and `with` words stop appearing after you use them. Paths or tab names with spaces or quotes are offered quoted. A quoted label after `in` is decoded before Tab looks up its local working directory for path suggestions. Tab does not complete inside an open quote, or against a remote or unknown `in` target. Whitespace inside a quoted directory does not stop path completion: for example, `files expand "my dir"/ne` can complete to `files expand "my dir/nested folder"/`.

Run `execute <name>` to execute a runscript now. `edit <name>` opens it for editing when no exact file target exists; a matching file path takes precedence. Paths, file extensions, and `:line` targets keep filesystem completion.
