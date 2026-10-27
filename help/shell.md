### shell

Open a zsh shell tab. By default it gets a fresh workspace; use `--no-workspace` for a local shell or `on <address>` for a remote shell.

**Usage**

`shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]`

`shell ... in group <name|id>`

**Use cases**

- Open an isolated shell for project work.
- Open a local shell without a workspace or connect to a remote host.
- Place the new shell in a named tab group.

**Examples**

- `shell` opens a shell with a fresh workspace.
- `shell --no-workspace` opens a local shell without a workspace.
- `shell on devbox` opens a shell on the remote host `devbox`.
