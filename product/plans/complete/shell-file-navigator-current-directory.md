# Open the file navigator in the shell's current directory

**Complexity: 2/10** — The shell metadata row's **open file navigator here** button opens the navigator at the tab's recorded working directory. That record used to stay where the shell started; the previous change made zsh's cwd reports record it through `recordCwd`, so the navigator already follows. What remains is pinning the whole chain with a test and describing the behavior.

## Goal

After `cd` in a shell tab, **open file navigator here** opens the navigator on the directory zsh is now in.

## Approach

No new code path. Verify that the shell plugin's `cwd` intent, through the real `recordCwd` capability and the real tab manager, moves the directory the file navigator's open-or-retarget rule reads, and document the behavior in the spec and the user documentation.

## Implementation

1. Add a server test that reports a new cwd through the shell activation with a real plugin context and `TabManager`, then opens the file navigator for that tab and checks where it opens.
2. Update the shell-tab spec and the shell user documentation.

## Tests

- After zsh reports a new directory, the tab's recorded directory is that directory and the file navigator opens there.

## Out of scope

- The new-shell action, already covered by the previous change.
- Remote shells, which a shell tab cannot be opened from.
