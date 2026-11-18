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
