# Keep the shell terminal in the application theme

**Complexity: 3/10** — observe the application's existing `<html data-theme>` change and refresh xterm's palette in the shell hook.

## Goal

Keep the shell terminal colors in sync with the application theme and theme picker.

## Approach

`useShellTerminal` already reads terminal colors from CSS variables when it creates xterm. Observe the root element's `data-theme` attribute and update the mounted terminal's theme from the same `terminalColors()` helper whenever the application theme changes.

## Implementation steps

1. Update the terminal palette on application theme changes and release the observer on teardown.
2. Test that a theme attribute change updates the mounted terminal palette.
3. Update the shell-tab spec and user guide to describe the shared theme.

## Tests

Extend `web/src/plugins/shell/useShellTerminal.test.ts` to verify palette refresh and observer cleanup. Run the diff-scoped checks.

## Out of scope

- Adding an independent theme setting for shell tabs.
- Changing the application theme picker.
