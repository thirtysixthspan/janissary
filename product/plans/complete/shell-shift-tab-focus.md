# Keep Shift+Tab between the shell bar and terminal

**Complexity: 2/10** — the two focus transitions already exist; strengthen their regression test and correct the user guide that describes the terminal as output-only.

## Goal

Make Shift+Tab cycle focus between the shell command bar and its terminal, without moving browser focus elsewhere.

## Approach

Keep the existing key handlers. Assert that each Shift+Tab transition prevents the browser's default focus traversal, and describe direct terminal input and the two-way shortcut in the user guide.

## Implementation steps

1. Extend the focus test to assert the key is prevented in both directions.
2. Update the shell-tab spec and shell user guide to describe the focus cycle and direct input.

## Tests

Extend the Shift+Tab case in `web/src/plugins/shell/ShellTab.test.tsx`. Run the diff-scoped checks.

## Out of scope

- Changing focus behavior for non-shell tabs.
