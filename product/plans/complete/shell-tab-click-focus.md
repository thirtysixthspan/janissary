# Shell tab click focus

## Complexity

2/10. The behavior is owned by one shell tab component and its existing tests and documentation.

## Goal

A single click on the shell terminal returns keyboard focus to the command bar. A double-click focuses the terminal so the user can type directly into zsh.

## Approach

Handle single clicks on the terminal body by focusing the command bar. Handle the browser's double-click event by focusing the terminal after the single-click handlers have run. Keep `Shift+Tab` transitions unchanged.

## Implementation steps

1. Change the shell tab's terminal-body handlers so a click focuses the command bar and a double-click focuses the terminal.
2. Update the shell tab interaction tests to cover both click behaviors.
3. Update the shell tab spec, `help.md`, and the shell command-bar user documentation to describe the new behavior.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`, verify that clicking the terminal body focuses the command bar without focusing the terminal, and that double-clicking the terminal body focuses the terminal.

## Out of scope

- Changing focus behavior for harness, SSH, or PTY takeover terminals.
- Changing `Shift+Tab` focus transitions or the shell tab's launch focus.
