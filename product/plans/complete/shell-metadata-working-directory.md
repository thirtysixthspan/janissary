# Show the shell working directory in its metadata row

**Complexity: 1/10.** The shell metadata row already renders the shell payload's recorded working directory.

## Goal

Keep the shell's starting working directory visible in its metadata row.

## Approach

Verify the existing shell metadata component, regression test, and functional spec already provide the requested behavior, then remove the resolved entry from the PR backlog.

## Implementation

1. Confirm `ShellTabMeta` renders `payload.cwd` and the shell tab test asserts the displayed path.
2. Confirm the shell tab spec documents the displayed starting directory.
3. Remove the resolved backlog entry.

## Tests

Run `./scripts/run.mjs check-diff` after the backlog update.

## Out of scope

Changing whether the displayed directory follows a later `cd` inside the shell.
