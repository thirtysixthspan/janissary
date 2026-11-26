# SSH config Host patterns

When aliases are read from an OpenSSH configuration, each `Host` line contributes its settings to the
aliases its names match. Ordinary `*` and `?` wildcards keep their usual meaning: `*` matches any part
of a name, `?` matches one character, matching ignores case, and a leading `!` excludes a name from
the block.

### Literal names with metacharacters

A `Host` name with no `*` or `?` is a literal alias even when it contains brackets or a backslash, as a bracketed IPv6 address does. Those characters match their own spelling instead of acting as glob syntax, so the alias receives the `HostName`, `User`, and `Port` from its own block rather than falling back to its name as the destination. A leading `!` still excludes a name, and `*` and `?` keep their wildcard meaning. An empty name is never literal.

The same rule decides which names are literal everywhere they are read: a name counted as a literal alias when receiving settings is also counted as a literal alias when reporting the names left outside a Janissary-managed section. A wildcard, a negated name, and an empty name are excluded from both.

### Complexity limits

A `Host` name more than 1024 characters long, or containing more than three separate `*` wildcards,
is too complex to use for matching. `**` counts as one wildcard, and `?` wildcards are not capped.
A name over either limit is refused: it contributes no `HostName`, `User`, or `Port` to any alias, and
it never stops the rest of the configuration from being read. When a refused name is negated, its
whole block contributes nothing, so a pathological name cannot make a block apply to aliases it was
meant to exclude.

Names within both limits behave exactly as before, including names with up to three `*`, `?` wildcards,
and negated names. See [[hosts-tab]].
