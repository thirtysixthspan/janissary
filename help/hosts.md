### hosts

Open the Hosts tab, a single table of saved hosts that can be opened as ssh sessions. Hosts are read from the effective `hosts.json` file: a project file replaces the home file entirely when one is in effect.

**Usage**

`hosts`

`hosts list`

`hosts add <name> <[user@]host[:port]> [path]`

`hosts remove <name>`

**Use cases**

- Open or focus the one Hosts tab; opening it again refreshes the rows already on screen.
- See the hosts in effect, with a blank user or path shown as an empty cell and the destination shown as `host` or `host:port`.
- Click a row twice, or select it and press Enter, to open an ssh tab for that host.
- Save a host with an optional user, port and remote working directory; adding an existing name updates it.
- Remove a saved host by name, ignoring case.

**Examples**

- `hosts` opens the Hosts tab.
- `hosts list` prints the effective catalog as indented JSON, or `{}` when there are none.
- `hosts add Lab ops@lab.local:2222 ~/work` saves a host and replies `Host Lab added.`
- `hosts remove lab` removes it and replies `Host Lab removed.`
- `hosts left` is refused with `Usage: hosts [list|add|remove].`; the Hosts tab stays in the centre.

**Notes**

Malformed requests reply with a usage line and never touch the catalog. A problem with a hosts file is reported once per distinct problem; it does not change the tab's rows until a Refresh or a return to the tab.
