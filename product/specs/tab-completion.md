# Tab Completion Specification

Janissary provides context-aware tab completion in the command line input, triggered by pressing the `Tab` key.

## General Behavior

When the `Tab` key is pressed, the shell attempts to complete the token immediately preceding the cursor.
- If no match is found, no action is taken.
- If a single match is found, the token is replaced with the full match (appending a trailing space for files, or a `/` for directories).
- If multiple matches are found, the token is replaced with the longest common prefix of all matches, and the user is presented with the list of possible completions. In a shell tab the list is a picker over the command bar: `↑`/`↓` move the selection, Return or a click accepts a candidate in place of the partial token, and `Escape` closes the picker without changing the line.

The completion logic determines the context based on the command and the argument position of the cursor within the command line.

A command typed over several lines with `Shift+Enter` completes the same way on every line. On a continuation line the token starts after the newline, and the words on earlier lines still set the command and the argument position: `ls`, `Shift+Enter`, `do` completes to `docs/`.

## Contextual Completion Rules

`execute` completes valid project runscript names in its single name slot. Bare `edit` targets combine runscript names with filesystem matches; paths, names containing extensions, and `:line` targets use filesystem completion. Both use the current project runscript catalog for each request. A missing or unsafe catalog contributes no runscript suggestions. Additional `execute` arguments receive no runscript suggestions.

### Application command names

At the first word of a command, completion offers the names and aliases of enabled application commands before matching filesystem paths. A command name is offered only for a non-empty bare word that contains no `/`, `\`, or quote; an empty word, a token beginning with `!` or `/`, and a token containing a path separator keep the existing filesystem completion. Candidate matching is case-sensitive.

Disabled commands and their fixed forms are not offered, and completion offers no arguments or paths under a disabled command or native child. A disabled name stays hidden even when a filesystem path with the same prefix remains available. Commands sharing a canonical name share one setting, so disabling the name hides every owner and form. A line beginning with `!` is explicit shell execution and is never filtered.

### File navigator command (`files`)

At a `files` clause position, completion offers matching bare keywords before filesystem paths in a
single candidate list. The once-only `in`, `on`, and `with` clauses are offered only until each has
been used. View keywords remain available, and bare `left`/`right` are offered when no `in` or `on`
clause has been used. `print` is offered only as the first word after `files`. After `in`, it offers
open tab labels; after `on`, `left` and `right`; after `with`, `name`, `size`, `modified`, and
`permissions`; and after `print`, labels of open file navigators only.
Once the single `files print` target has been entered, Tab leaves the line unchanged and offers no
further candidates; it does not fall back to filesystem paths.

After a view clause, paths complete relative to the local cwd named by an earlier `in <label>`, or
the issuing tab's cwd when no `in` clause was used. A missing or remote `in` target produces no path
matches and does not fall back to the issuing tab's cwd. The trailing root path is handled by
ordinary filesystem completion. A path or completed name containing whitespace or a quote is
offered wrapped in double quotes, with embedded double quotes escaped. A fully quoted `in` label is
decoded before its local cwd is looked up, so accepting a quoted label completion keeps path
suggestions rooted in that tab. If a quote is still open at the cursor, completion returns the input
unchanged with no matches. Whitespace inside a quoted directory does not end the path token, so
`files expand "my dir"/ne` completes children under `my dir`; the inserted path remains quoted when
needed. After a completed quoted path and a space, ordinary clause suggestions are available again.

The shell uses the following rules, in order of precedence:

### Help pages (`help`)

- **Context:** The first argument after `help`.
- **Candidates:** The names of markdown pages in the help directory, including `commands` and `keys`.
- **Behavior:** A matching name completes normally. A prefix with no match returns no candidates and does not fall through to filesystem path completion. A leading slash in the argument is not completed. Arguments after the first use the ordinary completion chain. While `help` is enabled, disabled commands keep their help pages and complete normally; when `help` itself is disabled, its command word and page completion are suppressed like any other disabled command.

### Tab target arguments

- **Context:** The target argument of `send`, `queue`, `close`/`exit`, `schedule … in <tab>`, and every `tab` subcommand.
- **Candidates:** Each open tab contributes its label and display title, including hidden tabs. Names duplicated without regard to case appear once, retaining the first spelling in tab order.
- **Behavior:** `tab` offers all eight subcommands, quotes target names containing whitespace, and offers `left`/`right` after `pane` and `dock`. Generic target completions offer spaced display titles without quoting them. `close` reads the full target remainder; `send`, `queue`, and `schedule` parse a single whitespace-delimited target token, so a spaced title offered there is not accepted as a whole target.

### Monitor and unmonitor target arguments

- **Context:** The target argument of `monitor` or `unmonitor`.
- **Candidates:** The labels of other action tabs in tab order, including hidden tabs, followed by one `group:<n>` selector for each action-tab group in ascending order. Display titles are not offered.
- **Behavior:** A display title can still be typed as a target and resolves to its tab.

### 2. Connection Management (`connections close`)

- **Context:** The target argument of `connections close`.
- **Candidates:** The same `<kind>:<id>` strings `connections list` prints for the tab (e.g., `sqlite:my-db`, `shell:bash`, `acp:opencode/big-pickle`, `browser:w1`, `ssh:devbox`, `terminal:vim`).

### 3. Browser Command (`browser`)

- **Context:** The `browser` command and its subcommands.
- **Candidates & Behavior:**
    - Completes browser subcommands.
    - For commands requiring a window ID (e.g., `browser use`, `browser window close`), completes against the current tab's open browser window IDs.

### 4. Harness Model (`harness ... --model`)

- **Context:** The value following a `--model` flag on a `harness` command.
- **Candidates:** The enabled model ids in the current catalog for the harness named earlier on the same command line. Disabled models are not offered.
- **Behavior:** The `--model` flag may appear anywhere after the harness name, alongside the command's other flags and options.

### 5. Filesystem Path Completion

- **Context:** Default fallback for all other positions.
- **Behavior:**
    - Completes based on the filesystem relative to the current working directory.
    - Supports tilde (`~`) expansion to the user's home directory. The completed token keeps the tilde, and a bare `~` completes the same as `~/`, offering the home directory's own entries (`~` + Tab can become `~/projects/`).
    - Hides hidden files (dotfiles) unless the partial name typed explicitly starts with a dot (`.`).
    - Appends a `/` if the match is a directory, and a space if it is a file.
