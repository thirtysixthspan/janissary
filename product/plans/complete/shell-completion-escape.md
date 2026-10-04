# Dismiss shell completion choices with Escape

**Complexity: 2/10** — one key branch in the shell tab, one focused test, and a spec clarification.

## Goal

Let Escape dismiss the shell tab's completion choice strip without changing the command line.

## Approach

The shell plugin owns the choice strip and already owns Escape when its history popup is closed. Handle Escape only while completion choices are present, before delegating to the shared command bar keymap. Keep `ShellTab.tsx` under the file-size limit by putting the small key decision in the existing shell command-bar helper module.

## Implementation steps

1. Add a helper that clears the completion choices and prevents the key from reaching other handlers when Escape is pressed with choices visible, then call it from the shell tab.
2. Test that the strip closes while the typed line remains unchanged.
3. Update the shell-tab spec to describe Escape dismissal.

## Tests

Extend `web/src/plugins/shell/ShellTab.test.tsx` with the visible-choice dismissal case. Run the diff-scoped checks.

## Out of scope

- Changing Escape behavior for other shell-tab popups or application command bars.
