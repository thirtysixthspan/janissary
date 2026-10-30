### files

Open a file navigator in the current tab's working directory, or target a path or working directory in another tab. Dock it in a sidebar, choose which detail appears beside each row, or restore its local view from the command line. Remote paths are resolved in that host's workspace.

**Usage**

`files [left|right] [path]`

`files [path] in <label>`

`files in <label> [on <side>] [with <name|size|modified|permissions>] [path]`

`files on <side> [in <label>] [with <name|size|modified|permissions>] [path]`

`files with <name|size|modified|permissions> [in <label>] [on <side>] [path]`

`files [clauses] [path]` also accepts repeated `expand <path>`, `collapse <path>`, and `select <path>` clauses, plus `cursor <path>` and `anchor <path>`.

`files print <tab>` prints a command that reopens an existing navigator.

Press `Tab` to complete clause words before matching paths. The once-only `in`, `on`, and `with` clauses disappear after use; `print` is available only as the first word. After `in`, Tab offers open tab labels and display titles; after `on`, sides; after `with`, detail modes; after `print`, open navigator labels. Once you enter the target of `files print`, Tab offers no more candidates. Paths after a view clause use the local working directory named by `in`, or the current tab's directory if you omit it. An unknown or remote target has no path suggestions.

**Use cases**

- Browse the current working directory or start at a specific path.
- Open a navigator rooted in another tab's working directory or a path within it. With `in <label>`, a path before that clause is resolved from the other tab's directory; a path after the clauses opens a subdirectory there.
- Write a tab label with spaces or quotes as one single- or double-quoted value; escape a matching quote inside it with a backslash. The same form works before or after a path.
- Dock the navigator in the left or right sidebar with a leading `left` or `right`, or with `on <side>`.
- Choose which file details appear beside each row with `with <name|size|modified|permissions>`.
- Use the `in`, `on`, and `with` clauses in any order before the path.
- Restore a local tree's expanded folders and selection with view clauses; their paths are relative to the tree root and can be quoted when they contain spaces or quotes.
- Print a tree's opening command with `files print <tab>`.

**Examples**

- `files src` opens a navigator at `src`.
- `files $root` opens a navigator at the project root. A path can also start with `~` for your home directory. In a remote tab, `$root` is that tab's remote workspace and `~` is your home directory on that host.
- `files right src` opens `src` in the right sidebar.
- `files in janus` opens a navigator at the `janus` tab's working directory.
- `files src in janus` opens `src` relative to the `janus` tab's working directory.
- `files src in in` opens `src` relative to the tab named `in`.
- `files in "review team" src` opens `src` relative to the `review team` tab's working directory.
- `files in janus on left with modified` opens the `janus` tab's working directory in the left sidebar and shows each row's modified time.
- `files with size src` opens `src` with each row's size.
- `files expand src cursor src/index.ts select src/index.ts` opens `src` and selects `src/index.ts`.
- `files print navigator` prints a `files` command for the open `navigator` tree.

Malformed `files` commands, including malformed `files print` requests, write one parser error in the issuing tab and open or change no tree. `files print <tab>` prints the tree's root, dock side, non-default detail mode, expanded folders, cursor, anchor, and selected rows. If the navigator does not answer the selection request before the timeout, it prints without selection clauses. A remote tree's printed command has no view clauses.

File-operation failures are reported in the notifications feed with the affected item, reason, and recovery guidance. Bulk move and delete failures use one line and name up to three failed items. If a move, paste, undo, or redo gets no reply, there is no overwrite dialog or per-item report. The operation may still have completed before its reply was lost, so check your files before trying it again. Remote file requests wait up to one minute; git pull and commit, search, bulk operations, history replay, and whole-file transfers wait up to ten minutes. A timed-out request reports `The remote machine did not answer in time.` and is not retried because the operation may have completed despite its lost reply.
