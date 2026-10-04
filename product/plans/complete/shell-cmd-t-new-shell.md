# Open a sibling shell with Cmd+T

**Complexity: 3/10.** The shell's existing dispatch intent already routes commands from the answering tab.

## Goal

Cmd+T in a shell tab opens another zsh tab with the same directory and workspace, without creating an agent workspace.

## Approach

Handle Cmd+T in the focused shell command bar and dispatch `zsh` through its existing plugin intent. Leave the application-wide Cmd+T behavior unchanged elsewhere.

## Implementation

1. Intercept Cmd+T in `ShellTab` and ask the existing dispatch intent to run `zsh`.
2. Add a regression proving the shell dispatches `zsh` and does not submit a line to its terminal.
3. Update the shell spec and existing user documentation, then remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after implementation and test changes.

## Out of scope

Changing Cmd+T in agent tabs or other plugin tabs; changing the existing workspace lifecycle.
