# Keep shell initialization out of command history

**Complexity: 2/10** — the shell terminal already tags each pre-execution command; the startup command can be excluded at that existing marker boundary.

## Goal

Keep the shell tab's injected status-hook setup command out of its user-visible command history while continuing to record commands typed into the terminal.

## Approach

The shell tab already sends its startup hook as one command and receives its text in the OSC 133 start marker. Compare that decoded text with the injected hook command and omit only that match from the command-history callback. Leave zsh execution, command-state markers, and all other history handling unchanged.

## Implementation steps

1. Suppress the exact shell initialization command when forwarding decoded start markers to command history.
2. Add a hook test proving initialization is omitted and ordinary terminal commands are still reported.
3. Update the shell-tab behavior spec and user guide to note that setup is not listed in shell command history.

## Tests

- The injected shell status hooks do not reach the shell command-history callback.
- A normal command marker still reaches the callback unchanged.

## Out of scope

- Changing zsh's own persisted history or its startup configuration.
- Changing how application commands, queued lines, or typed terminal commands are recorded.
