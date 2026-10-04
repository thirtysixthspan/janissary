# Send clear to the shell terminal

**Complexity: 2/10.** The shell's pure line router can reserve the exact `clear` command for zsh.

## Goal

Typing `clear` in a shell tab clears the terminal instead of invoking the application's transcript command.

## Approach

Treat a trimmed, case-insensitive bare `clear` as shell input. Keep `!` routing and every other application command unchanged.

## Implementation

1. Update the pure route rule and cover bare and forced `clear` submissions.
2. Update the shell spec and existing help and command reference, then remove the backlog entry.

## Tests

Run `$janissary/scripts/run.mjs check-diff` after each implementation and test change.

## Out of scope

Changing what `clear` does in agent tabs or changing slash-prefixed `/clear` behavior.
