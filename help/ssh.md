### ssh

Open an SSH session to a remote host in a full-tab terminal. A bare `ssh <name>` that matches a saved host connects with that host's stored user, port and working directory; any other form is passed to `ssh` as written, so SSH handles its own flags and remote command. Put connection options before the destination and any remote command after it.

**Usage**

`ssh [ssh options…] <destination> [remote command…]`

**Use cases**

- Connect to a remote host in an interactive terminal.
- Connect with one name to a saved host's stored destination, port and remote directory.
- Work with a remote session alongside local tabs.

**Examples**

- `ssh devbox` opens an SSH terminal for `devbox`.
- `ssh lab` connects to the saved host `lab`, using its stored port and remote path.
- `ssh -p 2222 -i ~/.ssh/id_ed25519 admin@devbox` connects as `admin` on port `2222` using the specified identity file.
- `ssh devbox uptime` runs `uptime` on `devbox`.

**Notes**

A saved name wins over a literal hostname or `~/.ssh/config` alias with the same spelling; flags, extra words and a trailing remote command keep the verbatim path. The new tab is labelled with the saved name, while the connections panel still shows the real `ssh:<destination>`.
