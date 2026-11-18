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

The `hosts` command opens a single table of the hosts in effect. Each row shows the name, the user, the destination and the remote path in that order, under matching column headings, with a narrow unlabeled column at the right for row controls. Rows keep the order the server supplies, which is name order ignoring case. A blank user or path leaves its cell empty, and the destination shows `host` or `host:port`. Long cells are cut short with an ellipsis. Hovering a row shows the full `[user@]host[:port]` on one line and, when one is saved, the remote path on the next line.

With no saved hosts the table shows only `No saved hosts` and no column headings. The metadata bar above the table stays available: its Refresh button re-reads the catalog, and the tab's Split control sits beside it. The tab re-reads the catalog once each time it is returned to after being hidden, but not when it first opens.

One click on a row makes it current; a second click on that same row opens it and launches an ssh connection to the saved host. Enter does the same for the current row while the list has focus. Up and Down move the highlight one row without wrapping, and Home and End jump to the first and last row. A row highlighted by the keyboard still takes two clicks to open, and a row replaced underneath the list never inherits a pending open from the row it replaced. Escape leaves the list unchanged, and a key pressed on a focused button belongs to that button rather than the list.

### Commands

The `hosts` command manages the catalog from a transcript. With no operands it opens the Hosts tab.
Every verb matches regardless of case, and all field rules above apply to what you type.

`hosts list` prints the effective catalog as JSON, two spaces per indent, in name order ignoring case.
An empty catalog and a catalog that cannot be used both print `{}`. A problem with the file is
reported separately, the listing itself stays plain text.

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
