### hosts

Open the Hosts tab, a single table of saved hosts that can be opened as ssh sessions. Hosts are read from the effective `hosts.json` file: a project file replaces the home file entirely when one is in effect.

**Usage**

`hosts`

`hosts list`

`hosts add <name> <[user@]host[:port]> [path]`

`hosts remove <name>`

**Use cases**

- Open or focus the one Hosts tab; opening it again refreshes the rows already on screen.
- See the hosts in effect, with a blank user or path shown as an empty cell and the destination shown as `host` or `host:port`. An empty catalog shows `No saved hosts` instead of column headings; Refresh, New host and Split still work.
- Click a row twice, or select it and press Enter, to open an ssh tab for that host.
- Move the highlight with `Up` and `Down`, which stop at the first and last row without wrapping. `Home` and `End` jump to those ends, and `Escape` leaves the list unchanged.
- Create a host with the New host button beside Refresh, or press Cmd+N / Ctrl+N while the list has focus.
- Edit or delete a host with the pencil or trash control at the right of its row.
- Save a host with an optional user, port and remote working directory; adding an existing name updates it.
- Remove a saved host by name, ignoring case.

**Examples**

- `hosts` opens the Hosts tab.
- `hosts list` prints the effective catalog as indented JSON, or `{}` when there are none.
- `hosts add Lab ops@lab.local:2222 ~/work` saves a host and replies `Host Lab added.`
- `hosts remove lab` removes it and replies `Host Lab removed.`
- `hosts remove ghost` replies `No host named "ghost".` when nothing matches, and leaves the catalog alone.
- `hosts left` is refused with `Usage: hosts [list|add|remove].`; the Hosts tab stays in the centre.

**Host form and deletion**

The New host form has Name, User, Destination and Path fields in that order; User and Path are optional and Destination expects `host[:port]`. An edit starts with the row's values and is titled `Edit host <name>`. Name is focused when the form opens, Tab moves through the fields and buttons and wraps at the ends, and Enter in a field saves. Cancel or Escape closes without saving. A refused save keeps the form open with its values and shows the reason; while the request is in flight Save is disabled and Cancel and Escape are ignored. On success the saved name is highlighted in the list, even after a rename that moves it.

Deleting asks `Delete host <name>?` first. Cancel, `n` or Escape backs out; the Delete button stays disabled and the dialog stays open while the request is in flight, so repeated confirmation cannot delete twice. A failed delete leaves the row in place.

**Notes**

A saved name also works as the `on <address>` target for `shell`, `harness`, and `agent` launches: the saved user, port, and path are used for that launch. See [Remote shells and harnesses](/user-documentation/advanced-agents/remote-agents#address-forms).

Malformed requests never touch the catalog. Every verb matches regardless of case, so `hosts LIST` works. An unknown verb or a bad `list` replies `Usage: hosts [list|add|remove].`, a bad `add` replies `Usage: hosts add <name> <[user@]host[:port]> [path]`, and a bad `remove` replies `Usage: hosts remove <name>`. An invalid name, user, host, port, or path in a structurally valid `hosts add` or `hosts remove` replies with that field's specific diagnostic — `Invalid <field> "<value>". Use letters, digits, and . - _ only.` for name, user, or host, `Invalid port "<value>". Use digits only, from 1 to 65535.` for a port, and `Invalid path "<value>". Use letters, digits, and . - _ / ~ only.` for a path. A problem with a hosts file is reported once per distinct problem; it does not change the tab's rows until a Refresh or a return to the tab.
