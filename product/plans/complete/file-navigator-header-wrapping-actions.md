# Fix: wrap the file navigator's header buttons onto more rows when it is narrow

**Complexity: 2/10** — stylesheet rules on the file navigator's existing header plus their colocated CSS tests. No markup, server, protocol, or tree-behavior change.

## Goal

When the file navigator is too narrow for its metadata row's icon buttons to fit on one line, the buttons wrap onto as many rows as they need, staying at the trailing edge, instead of overflowing past the navigator's edge.

## Approach

The header's action group (`.files-actions` in `web/src/theme.css`) is a single non-wrapping flex row that refuses to shrink (`flex-shrink: 0`). The header itself (`.files-header`) is a single non-wrapping row too. With up to ten buttons (GitHub, pull, commit, search, new file, new directory, dock cycle, detail cycle, split, collapse all), a narrow sidebar or a narrow split pane pushes the trailing buttons out of view.

1. **Let the action group wrap.** `.files-actions` gains `flex-wrap: wrap`, `justify-content: flex-end` (so a partial last row stays at the trailing edge, matching the single-row layout), a small row gap, and `max-width: 100%` so it can never be wider than the header. It keeps `flex-shrink: 0`, so in a header that still has room it never shrinks and squeezes the root path.
2. **Let the header wrap in the centre strip.** `.files-header` gains `flex-wrap: wrap` and a row gap, and the metadata block's flex basis changes from zero to `16ch` — the room the root path claims beside the buttons. The header stays on one line whenever the buttons fit beside that much path; with less room the buttons drop to a line of their own below the path, where rule 1 wraps them further. With a zero basis the header never wrapped, and the buttons wrapped beside a path squeezed to a sliver (seen in the browser check). The docked header already stacks into a column, overrides the metadata block's flex, and only needs rule 1.

## Implementation steps

1. Update the `.files-header`, `.files-meta`, and `.files-actions` rules in `web/src/theme.css`, with comments explaining the wrapping.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Extend `web/src/theme.test.ts` with the cases below.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Verify visually by rendering the header markup with the real stylesheet in the workspace's attached E2E browser at wide, sidebar, and very narrow widths.
6. Update `product/specs/file-navigator-tab.md` to state that the buttons wrap onto more rows when the header is too narrow.
7. Check `help.md` and `documentation/user-documentation/` for header-layout guidance, update it only if present.

## Tests

- The file navigator's action group rule wraps, aligns wrapped rows to the trailing edge, and is capped at the header's width.
- The file navigator's header rule wraps, and its metadata block claims a `16ch` basis, so the buttons drop below the root path when they do not fit beside it.

## Verification

Rendered the header markup with the real stylesheet in the attached E2E browser and measured the buttons. Before the fix, a 140px centre header and a 110px docked header kept every button on one row and overflowed the navigator's edge. After it, a 700px centre header and a 220px docked header keep one row. The 140px centre header wraps the buttons onto two rows below a 116px-wide path, and the 110px docked header wraps them onto three. No button overflows at any width.

## Out of scope

- Which buttons the header offers, their order, or their icons.
- The metadata rows of other tab kinds (agent, editor, monitor, plugin tabs).
- Sidebar width and resizing.
- The tree and its rows.
