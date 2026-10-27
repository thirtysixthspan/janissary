### files

Open a file navigator in the current tab's working directory, or target a path in another tab. Remote paths are resolved in that host's workspace.

**Usage**

`files [path]`

`files <path> in <label>`

`files <path> with <name|size|modified|permissions>`

**Use cases**

- Browse the current working directory or start at a specific path.
- Open a navigator rooted in another tab's workspace.
- Choose which file details appear in the navigator.

**Examples**

- `files src` opens a navigator at `src`.
- `files src in janus` opens a navigator for the `janus` tab's workspace.
