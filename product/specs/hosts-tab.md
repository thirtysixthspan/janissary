# Hosts tab

Saved hosts give a machine one name that can be reused wherever a destination is typed. A saved host
carries a name, an optional user, a destination of `host` or `host:port`, and an optional remote
working directory. Every surface that reads a host, whether from a hand-written file, the create
dialog, or a command, applies the same rules and keeps the same normalized form.

### Names and order

A name is made of letters, digits, dots, hyphens, and underscores. Names are compared without regard
to case, so `DevBox` and `devbox` name the same host and saving the second one is refused. A name such
as `__proto__` is treated like any other name. Hosts are listed in name order ignoring case, while
each name keeps the spelling it was saved with.

### Fields

The user, the destination host, and the name share one alphabet: letters, digits, dots, hyphens, and
underscores. A path may also contain slashes and tildes. Only the name and the destination are
required. A user or path that is left out, or that holds only whitespace, counts as absent; one set
to a value that is not text is refused. Each field is checked in full, so surrounding spaces are not
silently stripped away.

### Ports

A destination is a bare host, or a host followed by a colon and a port. The port must be digits only
and must name a whole number from 1 to 65535. An empty port, a port containing anything but digits, a
second colon, and a number outside the range are all refused. A destination without a colon has no
port. The user is its own field, so a destination never carries a `user@` prefix.

### Error wording

An invalid name, user, or destination host is reported as `Invalid <field> "<value>". Use letters,
digits, and . - _ only.`, with field set to `name`, `user`, or `host`. An invalid path is reported as
`Invalid path "<value>". Use letters, digits, and . - _ / ~ only.` and an invalid port as `Invalid
port "<value>". Use digits only, from 1 to 65535.` A host with no destination is reported as `Missing
destination.` A saved set that is not an object, an entry that is not an object, or two names that
differ only in case are refused rather than partly used. An empty set is valid and means there are no
saved hosts.

### The Hosts tab

The `hosts` command opens a single table of the hosts in effect. Each row shows the name, the user, the destination and the remote path in that order, under matching column headings, with an unlabeled column at the right wide enough to show both row controls in full. Rows keep the order the server supplies, which is name order ignoring case. A blank user or path leaves its cell empty, and the destination shows `host` or `host:port`. Long text cells are cut short with an ellipsis, but the row controls are never shortened or clipped, so both stay visible even when the table is narrow. Hovering a row shows the full `[user@]host[:port]` on one line and, when one is saved, the remote path on the next line. The tab is an ordinary bundled plugin, so it is listed by `plugins`.

With no saved hosts the table shows only `No saved hosts` and no column headings. The metadata bar above the table stays available: its Refresh button re-reads the catalog, and a New host button sits between that and the tab's Split control, even when the list is empty. With the list focused, Cmd+N or Ctrl+N opens the same new-host form; the chord is ignored when Shift or Alt is held or when a button has focus. The tab re-reads the catalog once each time it is returned to after being hidden, but not when it first opens. Running `hosts` again refreshes the rows of an already open tab in place and focuses it rather than opening a second table. The Hosts tab never moves into a sidebar: a generic tab-docking action leaves it in the centre, `hosts left` and `hosts right` are refused with the ordinary usage line, and its Split control still works.

One click on a row makes it current; a second click on that same row opens it and launches an ssh connection to the saved host. Enter does the same for the current row while the list has focus. Up and Down move the highlight one row without wrapping, and Home and End jump to the first and last row. A row highlighted by the keyboard still takes two clicks to open, and a row replaced underneath the list never inherits a pending open from the row it replaced. Escape leaves the list unchanged, and a key pressed on a focused button belongs to that button rather than the list. Each row ends in two icon-only controls: a pencil to edit that host and a trash can to delete it, named `Edit host <name>` and `Delete host <name>` for assistive technology. Pressing either leaves the current row selected and never opens the host, and ordinary button keys activate them.

Opening a row checks the name against the rows the tab is showing and then against the catalog in effect. A name the tab never offered is refused as a bad request. If the offered row has disappeared from the catalog, the tab publishes the fresh rows and reports `No host named "<name>".` attributed to itself. Otherwise the stored spelling is passed to the ssh command, which is the only place a saved name becomes an ssh launch. A saved name that vanishes between the two reads, a disabled ssh command, or an unclaimed line is reported on the Hosts tab; a successful launch is recorded only by the new ssh tab and its recording.

### Editing hosts

The tab can save and delete hosts against the catalog in effect. Saving a name that is not present creates it; saving under a name already present edits that entry, and a new spelling of the same name renames it without changing its neighbours. Names match without regard to case, so changing only the case is a rename of the same entry. A name that collides with a different entry is refused with `Host "<name>" already exists.` A save or delete whose original entry has disappeared since the tab last read is refused with `No host named "<name>".`

The form opens from the New host button or a row's pencil, titled `New host` or `Edit host <name>`. An edit begins with that row's four saved values; a new host begins with four empty fields. The fields read Name, User, Destination and Path in that order, with User and Path marked optional and Destination prompted with `host[:port]`. Name has focus when the form opens. Typing behaves normally and Tab moves through the fields and then the Save and Cancel buttons, wrapping from the end back to Name and from Name back to the end. Save submits the form, including when Enter is pressed in a field; Cancel or Escape closes it without sending anything.

While a save is in flight Save is disabled and neither Cancel nor Escape closes the form, so dismissing it cannot suggest that an already sent write was withdrawn. A refusal or a failed request leaves the form open, re-enables Save, keeps every value and shows the returned reason above the buttons; a reply the tab cannot understand shows `Could not save host.` On success the form closes and the saved name is highlighted in the list, using exactly the spelling the server returned. The list takes focus again when the tab is active, and the prior click identity is cleared so the highlighted row still needs its own click to open. This happens whether the updated catalog reaches the tab before or after the save answer, and follows a rename to the row's new position.

Deleting asks first, with a dialog titled `Delete host <name>?` whose confirm button reads Delete. Cancel, `n` and Escape leave the host alone and send nothing. Once confirmed, the confirm button is disabled and the dialog stays open until the request settles, including against repeated clicks and the `y` and Enter shortcuts, so the host cannot be deleted twice. The dialog closes on success, on a refusal already reported against the Hosts tab, or on a failed request. The rows always come from the server's catalog, so a failed delete leaves the row unchanged and a successful one removes it when the catalog arrives.

Every field is checked by the same rules as the `hosts add` command, and the field-specific error is returned for the form to show inline. Each accepted edit is written in one pass, at the file in effect: the project file when it is usable, otherwise the home file. The catalog that was just written replaces the tab's rows in name order ignoring case, with the file path of the file that was written, and the previous rows stay on screen when a save is refused or a write fails. A save answers with the spelling it stored on success, or the validation, duplicate, missing-host, unusable-file or write error on failure. A delete answers with nothing on success; on failure it reports the diagnostic as a notification on the Hosts tab and leaves the displayed rows unchanged until the server publishes them.

### Commands

The `hosts` command manages the catalog from a transcript. With no operands it opens the Hosts tab.
Every verb matches regardless of case, and all field rules above apply to what you type.

`hosts list` prints the effective catalog as JSON, two spaces per indent, in name order ignoring case.
An empty catalog and a catalog that cannot be used both print `{}`. A problem with the file is
reported separately, the listing itself stays plain text. Command results and refusals appear in the
transcript the command was typed in; a problem reported while the tab itself is acting is attributed
to the Hosts tab.

`hosts add <name> <[user@]host[:port]> [path]` saves a host. The destination may carry a user before
an `@`, which is split out into the user field. If a name already exists regardless of case, only that
entry is replaced and it takes the spelling you just typed. A new name reports `Host <name> added.`,
a replacement reports `Host <name> updated.`

`hosts remove <name>` removes the name that matches regardless of case and reports `Host <name>
removed.` with the spelling that was stored. If nothing matches, `No host named "<name>".` is reported
with the spelling you typed and the catalog is left alone.

Malformed requests never touch the catalog. An unknown verb or a bad `list` gives `Usage: hosts
[list|add|remove].`, a bad `add` gives `Usage: hosts add <name> <[user@]host[:port]> [path]`, and a bad
`remove` gives `Usage: hosts remove <name>`. A bare or repeated `@`, an empty user, wrong number of
operands, and any invalid field are refused before reading or writing. Problems reading or saving the
file are reported without rewording.
