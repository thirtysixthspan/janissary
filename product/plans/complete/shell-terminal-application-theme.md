# Paint the shell terminal in the application theme's own colors

**Complexity: 3/10** — The shell terminal takes its colors from `--terminal-bg` and `--terminal-fg`, and every application theme sets those two to the same dark pair, so switching to the light, Solarized, Nord or Dracula theme recolors the rest of the shell tab while the terminal content stays the dark default. The theme-change observer already rebuilds the terminal's palette on every theme change; it is reading properties that never differ between themes.

## Goal

The shell tab's terminal content — its background, text, cursor and selection — uses the active application theme's colors and follows the theme picker live, so the terminal matches the command bar and metadata row around it.

## Approach

Build the shell terminal's xterm theme from the application palette (`--bg`, `--fg`, and `--editor-selection` for the selection) rather than the shared terminal pair, falling back to the terminal pair when a property is unset. Paint the shell body's container with `--bg` too, so the strip around the grid matches. Harness and recording terminals keep `--terminal-bg`/`--terminal-fg`, which recordings rely on for the colors they were captured under.

## Implementation

1. Add `web/src/plugins/shell/shell-terminal-theme.ts` exporting `shellTerminalTheme()`, which reads the application palette from the root element's computed style and returns xterm's `background`, `foreground`, `cursor`, `cursorAccent` and `selectionBackground`.
2. Use it in `useShellTerminal` for both the initial palette and the theme-change refresh, replacing the local helper.
3. Set the shell body's background to `var(--bg)` in `shell.css`.
4. Update the shell-tab spec and the shell user guide to say the terminal uses the application theme's own background, text, cursor and selection colors.

## Tests

- `shell-terminal-theme.test.ts`: the theme is read from the application palette, and falls back to the terminal colors when the palette is unset.
- `useShellTerminal.test.ts`: the existing theme-change test asserts the application palette is applied at mount and again after a theme change, and that the observer is released on unmount.

## Out of scope

- Per-theme ANSI 16-color palettes.
- Harness, asciicast and inline terminal-card colors, and the colors reported for recordings.
