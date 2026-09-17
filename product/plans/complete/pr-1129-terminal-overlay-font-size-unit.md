# PR 1129 — selection overlay's font size actually tracks the theme stylesheet

Complexity: 2/10

## Goal

`useXterm` reads the terminal's font metrics from the theme stylesheet the same way the
overlay's CSS does, so the frozen selection layer stays identical to the live screen in
spacing as well as colour. But `--terminal-font-size` is declared in `theme.css` with a
`px` unit (`13.5px`), and `useXterm.ts` reads it with `Number(styles.getPropertyValue('--terminal-font-size'))`.
`Number('13.5px')` is `NaN`, so the `|| 13.5` fallback always fires — the emulator's
`fontSize` option is the hard-coded literal, never the stylesheet value. Today the
literal happens to equal the CSS value, so nothing visibly diverges, but the read is
dead: the overlay's `font-size: var(--terminal-font-size)` rule reads the real property
while the live xterm canvas is wired to a number that can never move with it. The two
renderers would silently fall out of character-spacing alignment the moment
`--terminal-font-size` is ever changed or overridden per theme.

## Approach

Strip the unit before parsing, matching the existing convention this codebase already
uses for the same kind of read in `web/src/editor/screen-rows.ts` and
`web/src/editor/useEditorInteractions.ts` (`Number(getComputedStyle(...).lineHeight.replace('px', '')) || fallback`).
`--terminal-line-height` carries no unit today, so it already parses correctly, but the
same defensive `.replace('px', '')` costs nothing and protects it if a unit is ever added
there too.

## Implementation steps

1. `web/src/shared/terminal/useXterm.ts`: change the `fontSize` read to
   `Number(styles.getPropertyValue('--terminal-font-size').replace('px', '')) || 13.5`,
   and the `lineHeight` read to
   `Number(styles.getPropertyValue('--terminal-line-height').replace('px', '')) || 1.2`.
2. Add a test in `web/src/harness/HarnessTab.test.tsx` beside the existing "constructs the
   terminal with the two colours" test: stub `getComputedStyle(document.documentElement)`
   to return `--terminal-font-size: 20px` and assert `capturedOptions.fontSize` is the
   parsed number `20`, not the `13.5` fallback — proving the px-unit value is actually
   read rather than silently discarded.

## Tests

- `HarnessTab.test.tsx`: the terminal is constructed with the numeric font size the
  stylesheet declares, once its `px` unit is stripped, instead of always falling back to
  the hard-coded literal.

Out of scope: any change to the overlay's own CSS (already reads the same custom
property correctly); per-cell ANSI colour/attribute fidelity for the frozen snapshot
(the snapshot is plain text today, and preserving per-character terminal colours is a
larger feature than this fix's font-size unit bug).
