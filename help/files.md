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
- `files right src` opens `src` in the right sidebar.
- `files in janus` opens a navigator at the `janus` tab's working directory.
- `files src in janus` opens `src` relative to the `janus` tab's working directory.
- `files in "review team" src` opens `src` relative to the `review team` tab's working directory.
- `files in janus on left with modified` opens the `janus` tab's working directory in the left sidebar and shows each row's modified time.
- `files with size src` opens `src` with each row's size.
- `files expand src cursor src/index.ts select src/index.ts` opens `src` and selects `src/index.ts`.
- `files print navigator` prints a `files` command for the open `navigator` tree.
