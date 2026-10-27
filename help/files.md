### files

Open a file navigator in the current tab's working directory, or target a path or working directory in another tab. Dock it in a sidebar or choose which detail appears beside each row. Remote paths are resolved in that host's workspace.

**Usage**

`files [left|right] [path]`

`files [path] in <label>`

`files in <label> [on <side>] [with <name|size|modified|permissions>] [path]`

`files on <side> [in <label>] [with <name|size|modified|permissions>] [path]`

`files with <name|size|modified|permissions> [in <label>] [on <side>] [path]`

**Use cases**

- Browse the current working directory or start at a specific path.
- Open a navigator rooted in another tab's working directory or a path within it. With `in <label>`, a path before that clause is resolved from the other tab's directory; a path after the clauses opens a subdirectory there.
- Dock the navigator in the left or right sidebar with a leading `left` or `right`, or with `on <side>`.
- Choose which file details appear beside each row with `with <name|size|modified|permissions>`.
- Use the `in`, `on`, and `with` clauses in any order before the path.

**Examples**

- `files src` opens a navigator at `src`.
- `files right src` opens `src` in the right sidebar.
- `files in janus` opens a navigator at the `janus` tab's working directory.
- `files src in janus` opens `src` relative to the `janus` tab's working directory.
- `files in janus on left with modified` opens the `janus` tab's working directory in the left sidebar and shows each row's modified time.
- `files with size src` opens `src` with each row's size.
