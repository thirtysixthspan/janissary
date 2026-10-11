# Clear the shell command line with Escape

**Complexity: 2/10** — one shell key handler, its regression test, and the shell tab behavior spec.

## Goal

When the shell command line is focused and contains text, pressing plain Escape clears the draft without sending it to zsh or scrolling the terminal.

## Approach

Handle Escape in the shell command bar after its existing overlay and completion handling. Consume the key only when a draft is present, so completion dismissal keeps its current first-press behavior and an empty command line still lets Escape return the terminal to the bottom.

## Implementation steps

1. Clear and consume plain Escape in the shell command bar when its draft is nonempty, after existing popup and completion handling.
2. Add a shell-tab regression test and update the shell tab spec, help table, and user shell command-bar guide with the key behavior and precedence.

## Tests

- `web/src/plugins/shell/ShellTab.test.tsx` verifies Escape clears typed command text without submitting it, and that the key does not continue to the document-level scroll handler.
- Existing completion Escape coverage continues to verify that the first Escape closes a visible completion strip without changing the draft.
- The help table and user shell guide describe the updated Escape behavior alongside the existing completion and scroll actions.

## Out of scope

- Changing Escape behavior in other command bars.
- Changing terminal-focused or empty-command-line Escape behavior.
- Changing Escape behavior in command bars other than the shell tab.
