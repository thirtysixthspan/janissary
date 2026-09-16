# PR 1129 — selection overlay uses the terminal's own colours

Complexity: 4/10

## Goal

The frozen selection overlay paints `color: #e4e5e7` on `background: var(--terminal-bg)`,
while the xterm terminal is constructed with a hard-coded `#17181b` background and
`#e4e5e7` foreground regardless of theme. On the light and solarized-light themes the
overlay is a near-white-on-light ground while the live screen beneath is light-on-dark,
so Shift+dragging there makes the terminal appear to vanish.

## Approach

Make the theme stylesheet the single source of both values: a `--terminal-fg` custom
property beside the existing `--terminal-bg` in every theme block, with `--terminal-bg`
set to `#17181b` in each (the value the emulator actually paints today, in every theme —
its canvas covers the container, so nothing user-visible moves). `useXterm` reads both
through `getComputedStyle(document.documentElement).getPropertyValue(...)`, the same way
it already reads `--mono`, falling back to the current literals when the property is
empty (jsdom defines no stylesheet values, so tests exercise the fallback). The overlay
rule's colour becomes `var(--terminal-fg)`. One definition per theme now feeds both the
emulator and the overlay.

## Implementation steps

1. `web/src/theme.css`: add `--terminal-fg: #e4e5e7;` and set `--terminal-bg: #17181b;`
   in all six palette blocks; change `.terminal-selection-overlay` to
   `color: var(--terminal-fg)`.
2. `web/src/shared/terminal/useXterm.ts`: read both properties with the existing
   `--mono` pattern (trim, literal fallback) and pass them as the `theme` option.
3. Test in `web/src/harness/HarnessTab.test.tsx` beside the
   `macOptionClickForcesSelection` assertion: the terminal is constructed with the
   theme `{ background: '#17181b', foreground: '#e4e5e7' }` — the two values the
   stylesheet defines.

Out of scope: any real per-theme terminal theming (the emulator stays dark in light
themes, as today); drive the overlay's font metrics from here where a later backlog
entry asks.
