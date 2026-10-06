# Shell terminal padding follows the theme

**Complexity: 2/10** — one stylesheet rule in the shell plugin and a test that pins it. Nothing outside the shell plugin changes.

The backlog asks: "in a shell tab, the padding and border of the terminal should respect the theme colors."

In the running app under the `light` theme, the shell terminal shows a black strip about 8px wide down its left edge, between the focus line and the first column of text. The strip is the terminal's 12px left padding. The terminal paints its cells in the application theme's background, but its `.xterm-viewport` element is absolutely positioned over the whole `.xterm` box, padding included, and xterm's own stylesheet gives it `background-color: #000`. xterm 6 no longer overrides that colour from the terminal theme, so the padding reads as a black border in every theme. Under a dark theme it is a slightly darker band than `--bg`; under a light theme it is a solid black bar beside the focus line.

## Goal

The shell terminal's padding and the area around its focus line are painted in the application theme's background, so nothing next to the terminal text is black unless the theme is.

## Approach

**Override the viewport's background in the shell stylesheet.** A `.shell-body .xterm .xterm-viewport { background-color: var(--bg); }` rule outranks xterm's `.xterm .xterm-viewport` rule and follows the theme through the same custom property the shell body and the terminal theme already read. No script change is needed: the custom property updates with `data-theme`, so the padding changes with the theme the moment the picker applies one.

The focus line already uses `--border` dimmed and the tab colour lit, both theme-aware; with the black viewport gone it sits on the theme background as intended.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The shell plugin's stylesheet, with the `.xterm` padding and the focus line | `web/src/plugins/shell/shell.css` |
| The terminal theme read from `--bg` / `--fg` | `web/src/plugins/shell/shell-terminal-theme.ts` |
| Stylesheet-content assertions to mirror | `web/src/plugins/shell/shell-style.test.ts` |

## Implementation steps

1. **Add the viewport background rule** to `web/src/plugins/shell/shell.css`, beside the `.xterm` padding rule.
2. **Update the shell tab spec** (`product/specs/shell-tab.md`, the paragraph on the terminal's theme colours) to say the padding around the terminal text uses the theme background too.

## Tests

In `web/src/plugins/shell/shell-style.test.ts`:

- The stylesheet paints `.shell-body .xterm .xterm-viewport` with `var(--bg)`, so the padded strip beside the text is the theme's background rather than xterm's black.

jsdom does not apply stylesheets, so the painted colour itself is verified in the running app through the end-to-end browser: under the `light` theme, the viewport's computed background is the theme's white and the left padding no longer shows a black strip.

## Out of scope

- **Harness terminals**, which keep their shared dark terminal colours by design.
- **The asciicast player**, which sits on `--terminal-bg` deliberately.
- **The host tab frame**, which is shared by every plugin tab.
