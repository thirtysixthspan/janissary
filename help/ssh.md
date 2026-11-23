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

A saved name wins over a literal hostname or `~/.ssh/config` alias with the same spelling; flags, extra words and a trailing remote command keep the verbatim path. Names match without regard to case, and a name that starts with a hyphen still counts, so `ssh -v` can select a host called `-v`. The new tab is labelled with the saved name, and the connections panel shows `ssh:<saved name>` (for example `ssh:thecandykingdom` rather than `ssh:anonymouscoward@10.27.1.94`). The real destination stays as the connection identity used by `connections list` and `connections close`.

A saved port is passed to `ssh`, and a saved working directory asks for a terminal: after login the remote side changes into that directory and then starts the account's login shell. An absolute path is used as it stands, a relative path starts at the SSH login directory, and `~` or a path beginning with `~/` points at the remote home with the rest kept literal, so the local shell never expands it. If the directory can't be entered, the remote side reports the failure and still starts the login shell in the original directory.

If the hosts file in effect can't be used, the name goes to `ssh` as a literal destination and the problem is reported once in the notifications feed, not in the tab's transcript. A valid personal catalog still supplies the match when a project hosts file is malformed. The new tab takes the group, color and working directory of the tab you typed the command in, even when another tab has focus as it opens, and that tab's transcript keeps the typed line exactly as entered, including a leading `/`. An ssh launch from the Hosts tab writes no transcript line and returns any launch error to the caller.
