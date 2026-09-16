# PR 1129 — pointer mapping through the overlay's own grid

Complexity: 6/10

## Goal

`cellFromPoint` derives cell width/height by dividing the container's bounding rect by
the terminal's `cols`/`rows`, while the overlay lays its snapshot out with the font's
natural advance and a `line-height` of 1.2 on 13.5px. The mapping arithmetic and the
layout the user drags across use different cell sizes, so the highlight drifts from the
pointer toward the right and bottom.

## Approach

Make the overlay's DOM the single source of the geometry. `SelectionOverlay` renders one
hidden probe row — a `.terminal-selection-row` of a known character count,
`position: absolute` and visibility-hidden so it shifts nothing — and hands a ref to it
up through each terminal surface. `useSelectionLayer` measures that row's
`getBoundingClientRect()`: width / probe characters is the real per-character advance,
height the real per-row height, and both go into `cellFromPoint` in place of the
container division. The container's rect keeps providing the grid's origin. A missing or
zero-sized probe (no layout yet, or no overlay row) falls back to the old container
division; a drag off the edge still clamps to the grid.

The overlay's `font-size`/`line-height` and the `Terminal` constructor's
`fontSize`/`lineHeight` are a hand-copy of each other; since the colour work added the
pattern of theme-styled terminal properties, the two sizes move into `theme.css` as
`--terminal-font-size` and `--terminal-line-height` and feed both consumers.

## Implementation steps

1. `web/src/shared/terminal/terminal-selection-layer.ts`: change `cellFromPoint` to
   `cellFromPoint(x, y, rect, cellWidth, cellHeight, cols, rows)` — `rect.left/top` for
   the origin, explicit cell sizes instead of dividing the rect, clamp to the grid kept.
2. `web/src/shared/terminal/SelectionOverlay.tsx`: render the absolute visibility-hidden
   probe row with `ref={probeRef};` take `probeRef?: RefObject<HTMLDivElement | null>`.
3. `web/src/shared/terminal/useSelectionLayer.ts`: own a `probeRef`, measure it in
   `cellAt`/the anchor path, fall back to container division when unavailable; expose
   `probeRef` on the returned `SelectionLayerApi`.
4. `web/src/harness/HarnessTab.tsx`, `web/src/ShellTab.tsx`,
   `web/src/shared/transcript/TerminalCard.tsx`: pass `selection.probeRef` through to
   `SelectionOverlay`.
5. `web/src/theme.css`: `--terminal-font-size: 13.5px` and `--terminal-line-height: 1.2`
   in the dark palette; overlay `font-size: var(--terminal-font-size)`,
   `line-height: var(--terminal-line-height)`; `useXterm` reads both (parseFloat,
   literal fallback) instead of hard-coding 13.5/1.2.
6. Tests: `terminal-selection-layer.test.ts` keeps its clamping and mapping assertions,
   now feeding explicit sizes (10px cells over the old 800x480/80/24 geometry so the
   expected cells are unchanged). `useSelectionLayer.test.tsx` adds a probe row div whose
   rect is stubbed to the same 10x20 cells (40 chars x 10 = 400 wide, 20 tall) so the
   measured path is exercised; the hook's existing assertions must all still hold.

Out of scope: real layout confirmation in a browser (manual, per the entry);
`layerHolds`/wide-character work (their own entries).
