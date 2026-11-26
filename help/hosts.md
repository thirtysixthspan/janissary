### hosts

Open the Hosts tab, a single table of saved hosts that can be opened as ssh sessions. Hosts are read from the effective `hosts.json` file: a project file replaces the home file entirely when one is in effect.

**Usage**

`hosts`

`hosts list`

`hosts add <name> <[user@]host[:port]> [path]`

`hosts remove <name>`

`hosts import [file]`

`hosts export [file]`

**Use cases**

- Open or focus the one Hosts tab. Running `hosts` again refreshes its rows in place. Coming back to the tab after hiding it re-reads the catalog; opening it the first time doesn't.
- See the hosts in a table with **Name**, **User**, **Destination** and **Path** columns in that order. Rows follow name order ignoring case and keep the spelling you saved. A blank user or path leaves its cell empty, and the destination reads `host` or `host:port`. Long cells end in an ellipsis; the two controls at the right stay fully visible. An empty catalog shows `No saved hosts` with no column headings, while Refresh, New host, Import from ssh config, Export to ssh config and Split still work.
- Hover a row for its full `[user@]host[:port]` on one line, with the saved path on the next line when it has one.
- Click a row twice, or select it and press Enter, to open an ssh tab for that host. A row highlighted with the keyboard still takes two clicks to open with the mouse.
- Move the highlight with `Up` and `Down`, which stop at the first and last row without wrapping. `Home` and `End` jump to those ends, and `Escape` leaves the list unchanged.
- Create a host with the New host button beside Refresh, or press Cmd+N / Ctrl+N while the list has focus.
- Edit or delete a host with the pencil or trash control at the right of its row. Screen readers name them `Edit host <name>` and `Delete host <name>`.
- Save a host with an optional user, port and remote working directory; adding an existing name updates it.
- Remove a saved host by name, ignoring case.
- Import every usable alias from an ssh config into the catalog with the **Import from ssh config** button beside New host, or with `hosts import`. Each literal alias becomes one saved host with its destination, user and port; aliases that clash or cannot be expressed as saved hosts are skipped and counted in the summary. Nothing you already saved is changed.
- Export the saved hosts back into one Janissary-managed section of an ssh config with the **Export to ssh config** button or `hosts export`. The section mirrors the catalog; anything outside the markers is left alone, and a saved host shadowed by a literal alias outside the section is skipped.
- Both actions are one step, with no dialog or choice of hosts, and work only in local tabs. The buttons report in the notifications feed; the commands answer in the transcript and refresh an already open Hosts tab. Both default to `~/.ssh/config` and accept a file operand, including a double-quoted path with spaces.

**Examples**

- `hosts` opens the Hosts tab.
- `hosts list` prints the effective catalog as indented JSON, or `{}` when there are none.
- `hosts add Lab ops@lab.local:2222 ~/work` saves a host and replies `Host Lab added.`
- `hosts remove lab` removes it and replies `Host Lab removed.`
- `hosts remove ghost` replies `No host named "ghost".` when nothing matches, and leaves the catalog alone.
- `hosts import` reads `~/.ssh/config` and replies `Imported 1 host from ~/.ssh/config; skipped 2.` when one alias is added and two are skipped, or `No aliases to import from ~/.ssh/config.` when nothing can be added.
- `hosts export "~/my hosts"` writes the managed section to that one file and replies `Exported 1 host to ~/my hosts; skipped 1.`
- `hosts left` is refused with `Usage: hosts [list|add|remove|import|export].`; the Hosts tab stays in the centre.

**Host form and deletion**

The New host form has Name, User, Destination and Path fields in that order; User and Path are optional and Destination expects `host[:port]`. An edit starts with the row's values and is titled `Edit host <name>`. Name is focused when the form opens, Tab moves through the fields and buttons and wraps at the ends, and Enter in a field saves. Cancel or Escape closes without saving. A refused save keeps the form open with its values and shows the reason; while the request is in flight Save is disabled and Cancel and Escape are ignored. On success the saved name is highlighted in the list, even after a rename that moves it.

Saving under a name that's already present edits that entry, and changing only its case renames it. A name that collides with a different host is refused with `Host "<name>" already exists.` A save or delete whose original host has disappeared is refused with `No host named "<name>".` A reply the tab can't understand leaves the form open and shows `Could not save host.`

Deleting asks `Delete host <name>?` first. Cancel, `n` or Escape backs out; the Delete button stays disabled and the dialog stays open while the request is in flight, so repeated confirmation cannot delete twice. A failed delete leaves the row in place.

**Notes**

A saved name also works as the `on <address>` target for `shell`, `harness`, and `agent` launches: the saved user, port, and path are used for that launch. See [Remote shells and harnesses](/user-documentation/advanced-agents/remote-agents#address-forms).

Opening a row's ssh session writes no line to the Hosts tab's transcript, since that tab has no transcript. If the launch fails immediately, the error comes back to the Hosts tab as a notification instead of being written to a log.

Malformed requests never touch the catalog. Every verb matches regardless of case, so `hosts LIST` works. An unknown verb or a bad `list` replies `Usage: hosts [list|add|remove|import|export].`, a bad `add` replies `Usage: hosts add <name> <[user@]host[:port]> [path]`, a bad `remove` replies `Usage: hosts remove <name>`, a bad `import` replies `Usage: hosts import [file]`, and a bad `export` replies `Usage: hosts export [file]`. An invalid name, user, host, port, or path in a structurally valid `hosts add` or `hosts remove` replies with that field's specific diagnostic — `Invalid <field> "<value>". Use letters, digits, and . - _ only.` for name, user, or host, `Invalid port "<value>". Use digits only, from 1 to 65535.` for a port, and `Invalid path "<value>". Use letters, digits, and . - _ / ~ only.` for a path. A problem with a hosts file is reported once per distinct problem; it does not change the tab's rows until a Refresh or a return to the tab.

Import and export work only in local tabs: from a remote tab both refuse with `hosts import and hosts export work only in local tabs.` Neither catalog can be an import source or an export target; naming one is refused with `Cannot export hosts: <path> is the hosts catalog and cannot be an export target.` (or the matching import wording). An unreadable import source or export target is refused with `Cannot read ssh config <path>: <problem>.`, a failed write with `Could not write ssh config <path>: <problem>.`, and an unusable catalog with `Cannot export hosts: <path> is unusable — fix it by hand.`; a refused export leaves the config unchanged. An imported host stores only its destination, user and port, so other settings from the alias are not saved; launching it still runs the real ssh binary, which reads your ssh config for the destination as usual.

Saved hosts live at `~/.janissary/hosts.json`, overridden by your project's `.janissary/hosts.json`. A usable project file replaces the home file entirely, even when it holds `{}`: that explicitly means zero hosts, and the two files are never merged. When neither file exists, the catalog is empty and the first save creates the file in effect.

A file that can't be read or decoded doesn't take effect, so a broken project file lets a valid home file supply the hosts. An unusable home file leaves no hosts available and refuses saves. Each unusable file consulted is reported once as `Hosts file <path> is unusable: <problem>.`; the notice repeats only when the problem changes or returns after the file is fixed, and Janissary never rewrites an unusable file to repair it. When the home file is unusable, a save or remove is refused with `Cannot save hosts: <path> is unusable — fix it by hand.`.
