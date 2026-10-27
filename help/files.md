### files

Open a file navigator in the current tab's working directory, or target a path or working directory in another tab. Dock it in a sidebar or choose which detail appears beside each row. Remote paths are resolved in that host's workspace.

**Usage**

`files [left|right] [path]`

`files [path] in <label>`

`files in <label> [on <side>] [with <name|size|modified|permissions>] [path]`

`files on <side> [in <label>] [with <name|size|modified|permissions>] [path]`

`files with <name|size|modified|permissions> [in <label>] [on <side>] [path]`

The leading `left` or `right` docks the navigator. Alternatively, `on <side>` docks it on the left or right. Use `in <label>` to use another tab's working directory; a path before `in <label>` is resolved from that directory, and a path after the clauses opens a subdirectory there. The `in`, `on`, and `with` clauses can appear in any order before the path. `with` chooses the detail shown beside each row.

**Use cases**

- Browse the current working directory or start at a specific path.
- Open a navigator rooted in another tab's working directory or a path within it.
- Dock the navigator in the left or right sidebar.
- Choose which file details appear in the navigator.

**Examples**

- `files src` opens a navigator at `src`.
- `files right src` opens `src` in the right sidebar.
- `files in janus` opens a navigator at the `janus` tab's working directory.
- `files src in janus` opens `src` relative to the `janus` tab's working directory.
- `files in janus on left with modified` opens the `janus` tab's working directory in the left sidebar and shows each row's modified time.
- `files with size src` opens `src` with each row's size.
