# Shell tab keyboard copy

**Complexity: 3/10** — the shell terminal already exposes its selection and the plugin already receives the shared clipboard capability; the missing piece is its key handler.

## Goal

Copy selected shell-terminal text with the platform's terminal copy chord. The text must reach the system clipboard and the in-session clipboard history through the shared copy helper.

## Approach

Use the shared terminal copy-chord and platform helpers in the shell terminal's xterm key handler. Pass the shell plugin's `copyText` capability into the terminal hook, and only consume the chord when xterm has a selection. The shared copy helper already writes to the system clipboard and publishes the text to clipboard history.

## Implementation steps

1. Add terminal copy-chord handling to `useShellTerminal`, using the existing shared helper and the terminal selection.
2. Pass `capabilities.copyText` from `ShellTab` into the terminal hook and add hook tests for a selected and unselected chord.
3. Update the shell-tab behavior spec with the terminal copy chord.

## Tests

- A selected terminal copy chord sends the selected text through the shared `copyText` capability.
- A copy chord with no selection is left for the shell process.

## Out of scope

- Changing command-bar copy behavior or terminal selection gestures.
- Adding a new clipboard writer or clipboard-history route.
- Documenting behavior that was not previously described in public user documentation.
