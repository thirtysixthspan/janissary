# SSH config Host patterns

When aliases are read from an OpenSSH configuration, each `Host` line contributes its settings to the
aliases its names match. Ordinary `*` and `?` wildcards keep their usual meaning: `*` matches any part
of a name, `?` matches one character, matching ignores case, and a leading `!` excludes a name from
the block.

### Complexity limits

A `Host` name more than 1024 characters long, or containing more than three separate `*` wildcards,
is too complex to use for matching. `**` counts as one wildcard, and `?` wildcards are not capped.
A name over either limit is refused: it contributes no `HostName`, `User`, or `Port` to any alias, and
it never stops the rest of the configuration from being read. When a refused name is negated, its
whole block contributes nothing, so a pathological name cannot make a block apply to aliases it was
meant to exclude.

Names within both limits behave exactly as before, including names with up to three `*`, `?` wildcards,
and negated names. See [[hosts-tab]].
