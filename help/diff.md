### diff

Open the diff tab to review project changes, changes under one directory, or a selected tab's workspace changes.

**Usage**

`diff`

`diff <path>`

`diff on <tab name>`

`<path>` must be an existing directory inside the project, not a file. `<tab name>` is one word, and you can't combine a path with `on`.

**Use cases**

- Review all project changes against HEAD.
- Focus the diff on one directory.
- Review changes in another tab's workspace.

**Examples**

- `diff` opens the project's changes against HEAD.
- `diff src` limits the diff to the `src` directory.
- `diff on ahmed` opens the workspace diff of the tab named `ahmed`.

**Notes**

- A missing path or a file prints `Cannot diff <notes.txt>: no such directory.`
- A path combined with `on`, or `on` with no name, prints `Usage: diff [path] [on <tab name>]`.
- Each hunk opens with a `@@ -start,length +start,length @@` header. Added lines carry a green `+` and removed lines a red `−`, each beside its line number.
- In a repository with no commits yet, all changes and staged changes show every file as added, rather than an error.
