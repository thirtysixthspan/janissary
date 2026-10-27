### ssh

Open an SSH session to a remote host in a full-tab terminal. Janissary passes the full invocation to `ssh` as written, so SSH handles its own flags and remote command. Put connection options before the destination and any remote command after it.

**Usage**

`ssh [ssh options…] <destination> [remote command…]`

**Use cases**

- Connect to a remote host in an interactive terminal.
- Work with a remote session alongside local tabs.

**Examples**

- `ssh devbox` opens an SSH terminal for `devbox`.
- `ssh -p 2222 -i ~/.ssh/id_ed25519 admin@devbox` connects as `admin` on port `2222` using the specified identity file.
- `ssh devbox uptime` runs `uptime` on `devbox`.
