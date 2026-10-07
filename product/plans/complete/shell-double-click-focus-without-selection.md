# Shell double-click focus without selection

**Complexity: 2/10** — a small change to the shell terminal handle and its double-click handler, with a regression test and one behavior-spec update. No protocol or architecture changes.

## Goal

Double-clicking a shell terminal moves keyboard focus to the terminal without leaving its line content selected.

## Approach

Expose the terminal's existing `clearSelection()` operation through the shell terminal handle. When the shell body receives a double-click, clear any selection xterm created during the gesture, then focus the terminal. This keeps ordinary terminal selection gestures intact while making the focus gesture leave no selection behind.

## Implementation steps

1. Add a `clearSelection()` method to `ShellTerminalHandle` and implement it against the live xterm terminal.
2. Call `clearSelection()` before focusing the terminal in the shell body's double-click handler.
3. Update the shell tab regression test to assert that double-click clears terminal selection and focuses the terminal.
4. Update `product/specs/shell-tab.md` to describe the double-click behavior.
5. Update `help.md` and `documentation/user-documentation/command-bar/shell.md`, which already describe this gesture.

## Tests

- In `web/src/plugins/shell/ShellTab.test.tsx`, verify double-click clears any terminal selection and focuses the terminal.

## Out of scope

- Changing selection behavior for drags, single-clicks, or other terminal types.
