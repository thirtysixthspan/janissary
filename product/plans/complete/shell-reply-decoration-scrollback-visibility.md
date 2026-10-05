# Keep shell reply decorations visible while scrolling

## Complexity

6/10. The change depends on xterm's marker and render lifecycle: a tall decoration must remain positioned as its anchor row moves above or below the viewport.

## Goal

Keep the visible portion of a shell markdown reply rendered while scrolling through its terminal scrollback, even after the decoration's first row leaves the viewport.

## Approach

Anchor the decoration to the last reserved row, which is near the shell prompt when the reply is written. In its render callback, position the full-height block from that anchor and the active buffer's viewport offset. Show the block while any part overlaps the viewport, hide it when it is fully outside, and keep it hidden in the alternate buffer.

## Implementation steps

1. Add a focused placement helper in `web/src/plugins/shell/markdown-block.ts` and register the decoration against the last reserved row.
2. Test partial visibility as the block's first row moves above the viewport, full dismissal after the block scrolls away, and suppression in the alternate buffer.
3. Update the shell-tab spec and existing shell user guide to describe the decoration staying visible through scrollback.

## Tests

- `web/src/plugins/shell/markdown-block.test.ts`: anchor offset, viewport-relative placement, partial visibility, fully out-of-view behavior, and alternate-buffer hiding.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specs and docs

- `product/specs/shell-tab.md`: state that scrolling through a reply keeps its visible portion rendered even when the top row is above the viewport.
- `documentation/user-documentation/command-bar/shell.md`: describe the same behavior in user-facing language.

## Out of scope

- Changing reply measurement, reserved row count, or the no-scrollbar behavior.
- Changing markdown rendering, command output, terminal selection, or scrollback retention.
