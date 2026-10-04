# Open a sibling shell from the shell metadata row

**Complexity: 3/10.** The metadata button can use the shell plugin's existing dispatch intent to run its registered `zsh` command from the current shell tab.

## Goal

Make the shell metadata row's plus button open another shell in the current shell's working directory and workspace.

## Approach

Route the button through the existing `zsh` dispatch path so the shell plugin opens a sibling shell with its current tab as the origin.

## Implementation

1. Change the metadata action and title from new agent to new shell.
2. Add a UI regression and update the shell spec.
3. Run diff checks and remove the resolved PR backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after each implementation step and after tests.

## Out of scope

Changing `Cmd+T` or the `zsh` command's origin rules.
