# Shell terminal focus border

**Complexity: 2/10** — a stylesheet rule, one custom property on the terminal container, and a padding. All inside the shell plugin; nothing in the host frame changes.

The backlog asks: "in shell tabs, when the keyboard focus moves into the terminal area, a left hand border should be highlighted, and dim when it looses focus. increase the left hand padding slightly to give visual separation between the border and the shell text."

A shell tab has two keyboard surfaces, the command bar and the terminal, and nothing on screen says which one has the keyboard. The only left-hand line today is the host's 4px tab frame (`tabBodyBorder` in `PluginTabLayer`), which is lit for the current tab whichever surface holds focus. That frame is shared by every plugin tab and also tells a split view's two panes apart, so it cannot change meaning for shell tabs alone. The terminal's text also starts flush against that frame, with no gap at all.

## Goal

The shell terminal carries its own left-hand line: lit while the keyboard is in the terminal, dim while it is anywhere else (the command bar included). The terminal's text sits clear of that line.

## Approach

**Track focus with `:focus-within`, not state.** xterm keeps its input textarea inside the terminal container, so `.shell-body:focus-within` is true exactly while the terminal holds the keyboard. A stylesheet rule follows focus as it moves by click, by `Shift+Tab`, or by anything else, with no handler to keep in step.

**Draw the line over the terminal, not as a border.** The terminal sizes its grid from its container's width, and the stylesheet's global `box-sizing: border-box` means a real border would steal width the fit never accounts for. A 2px absolutely positioned `::before` line, set 3px in from the container's left edge so it reads as separate from the host frame beside it, takes no layout space at all.

**Pad the terminal element, which the fit does account for.** The fit addon subtracts the `.xterm` element's own padding when it computes columns, so `padding-left` on `.shell-body .xterm` moves the text clear of the line without clipping the last column.

**Lit in the tab's colour, dim in the border colour.** The terminal container receives the tab's dot colour as `--shell-focus-color`, the same colour the tab strip and the frame use for this tab; unfocused, the line uses the theme's `--border`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The terminal container and the tab's dot colour | `web/src/plugins/shell/ShellTab.tsx` |
| The shell plugin's stylesheet | `web/src/plugins/shell/shell.css` |
| Stylesheet-content assertions to mirror | `web/src/plugins/shell/ShellTab.test.tsx` ("seats clipboard and shell history …") |

## Implementation steps

1. **Set `--shell-focus-color`** on the `.shell-body` element from the tab's dot colour (falling back to the shell's default dot colour).
2. **Add the focus line and padding rules** to `web/src/plugins/shell/shell.css`.
3. **Update the shell tab spec** (`product/specs/shell-tab.md`, "Choose where keys go").

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`:

- The terminal container carries `--shell-focus-color` set to the tab's dot colour, and to the shell's default dot colour when the tab has none.
- The stylesheet draws a dim `--border` line on `.shell-body::before`, lights it with `--shell-focus-color` under `.shell-body:focus-within::before`, and pads `.shell-body .xterm` on the left.

jsdom does not apply stylesheets or `:focus-within`, so the lit/dim switch itself is verified in the running app through the end-to-end browser (focus the terminal, read the line's computed colour, return to the command bar, read it again).

## Out of scope

- **Changing the host tab frame**, which belongs to every plugin tab and marks the current pane in a split.
- **Showing or hiding the terminal's prompt and cursor by focus**, and **emphasizing the prompt and command lines**. Separate backlog items.
- **Harness, ssh, and other terminal surfaces.** The issue names shell tabs.
