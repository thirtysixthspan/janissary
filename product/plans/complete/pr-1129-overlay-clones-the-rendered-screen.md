# PR 1129 — the frozen overlay is the rendered screen, cloned

Complexity: 7/10 (implemented at the user's explicit instruction to override the complexity limit)

## Goal

The Shift+drag overlay is supposed to be the screen, held still. It is not: it re-draws the
snapshot as plain text in a stylesheet of its own, so everything the emulator painted is lost the
moment the drag starts.

* **Colours.** `translateToString(true)` returns characters and nothing else. Every ANSI colour,
  every bold/dim/italic/underline run, the inverse video a harness draws its selected row with, and
  the cursor all vanish. A claude or codex screen — which is almost entirely coloured — turns
  monochrome under the pointer.
* **Spacing.** The overlay lays its rows out with CSS: `font-size: var(--terminal-font-size)` and
  `line-height: var(--terminal-line-height)` over the font's natural advance. xterm lays its rows
  out on a grid it computes in device pixels and rounds — `cell.height` is
  `floor(ceil(charHeight · dpr) · lineHeight) / dpr`, `cell.width` is the canvas width over `cols`
  — and then corrects the residue with an explicit `letter-spacing` on `.xterm-rows`. The two
  layouts agree only by luck, and the error accumulates across a row and down the screen.
* **Origin.** The overlay sits at the container's top-left and the pointer mapping divides the
  *container* box by `cols`/`rows`. xterm's screen element is its own box inside that container,
  sized to exactly `cols × cellWidth` by `rows × cellHeight`. When the container is taller than the
  grid — the ordinary case, since the fit addon floors the row count — every row of the mapping is
  scaled against the wrong height.

## Approach

Stop re-drawing the screen and clone it instead. xterm is constructed here with no renderer addon,
so it runs its DOM renderer: `.xterm-screen` holds a `.xterm-rows` container of one `div` per row,
each row a run of `span`s carrying `xterm-fg-N` / `xterm-bg-N` / `xterm-bold` / `xterm-dim` classes,
under inline `letter-spacing` and inline per-row width and height. Deep-cloning that element yields
the screen exactly as painted — colours, styling, cursor, advance and all — with no stylesheet of
our own to keep in step.

Two things make the clone render identically outside the terminal's element:

1. The renderer scopes every rule it injects to `.xterm-dom-renderer-owner-<n>`, a class it puts on
   the terminal's root element. Copying that root's `className` onto the overlay's host div brings
   all of those rules — font, colours, weights — onto the clone. The rules themselves are in
   `<style>` elements the renderer parked inside `.xterm-screen`; those apply document-wide from
   where they already are, so the clone drops its copies of them rather than duplicating the sheet.
2. The clone is positioned at the live screen element's own offset inside the container, and the
   pointer mapping is given the same offset and the same cell size, measured off that element's
   bounding box (`width / cols`, `height / rows` — the exact `css.cell` figures xterm derives
   them from). Painting and hit-testing then share one grid, and it is xterm's.

The highlight moves from a `<span class="editor-sel">` wrapped around re-drawn text — impossible
over a clone we do not re-author — to absolutely positioned rectangles on that grid, one per
selected row, in the same translucent `--editor-selection` the span used. Extent is unchanged: a
row's rectangle covers the cells the pick covers and stops where the row's text stops.

The probe row goes away. It existed to measure a layout the overlay no longer performs, and the
screen element reports the real grid directly.

The text path stays as the fallback for a surface with no DOM-rendered screen to clone (a terminal
that has not opened yet, or a future canvas/WebGL renderer whose `cloneNode` would come back
blank). `freezeTerminalScreen` reports `node: null` there and the overlay renders rows exactly as
it does today.

## Implementation steps

1. `web/src/shared/terminal/terminal-selection-layer.ts`: add a `ScreenMetrics` type
   (`cellWidth`, `cellHeight`, `offsetLeft`, `offsetTop`) and take it in `cellFromPoint` in place of
   the two loose sizes, subtracting the offsets from the pointer position before dividing. Clamping
   and the zero-size guard stay.
2. New `web/src/shared/terminal/terminal-screen-clone.ts`: `freezeTerminalScreen(term, container)`
   returns `{ node, ownerClass, metrics }`. It finds `.xterm-screen` under `term.element`, requires
   a `.xterm-rows` inside it (the DOM renderer's signature), deep-clones it, strips the cloned
   `<style>` elements and the `xterm-cursor-blink` class (a still image must not blink), and reads
   the metrics off the screen element's and the container's bounding boxes. With no such element it
   returns `node: null` and the container-division metrics the hook used before.
3. New `web/src/shared/terminal/terminal-selection-rects.ts`: `highlightRects(state, metrics)` —
   one rectangle per selected row in the snapshot, columns resolved in cell space against the row's
   own cell count so the extent matches what `rangeSplitForLine` picks.
4. New `web/src/shared/terminal/FrozenScreenView.tsx`: the host div carrying the terminal's owner
   classes, positioned at the frozen offset, with the cloned node attached in an effect, plus the
   highlight rectangles.
5. `web/src/shared/terminal/SelectionOverlay.tsx`: take `screen: FrozenScreen | null`; render
   `FrozenScreenView` when it carries a node, the existing text rows otherwise. Drop the probe row
   and `PROBE_CHARACTERS`.
6. `web/src/shared/terminal/useSelectionLayer.ts`: hold the layer and its frozen screen in one
   state object so they can never disagree, keep the metrics in a ref for the drag, call
   `freezeTerminalScreen` at Shift+pointerdown, drop the probe and the `grid()` measurement, and
   expose `screen` on `SelectionLayerApi` in place of `probeRef`.
7. `web/src/harness/HarnessTab.tsx`, `web/src/ShellTab.tsx`,
   `web/src/shared/transcript/TerminalCard.tsx`: pass `selection.screen` instead of
   `selection.probeRef`.
8. `web/src/theme.css`: drop `.terminal-selection-probe`, add `.terminal-selection-highlight`, and
   give the overlay a `z-index` so it is above the terminal element regardless of the order React
   and `term.open` leave the container's children in.

## Tests

* `terminal-screen-clone.test.ts` (new): metrics come from the screen element's box, not the
  container's, and carry its offset inside the container; the clone keeps the rows, the spans and
  their colour classes, and the inline `letter-spacing`; `<style>` children and
  `xterm-cursor-blink` are stripped; the owner class is carried; a terminal with no element, and
  one whose screen has no `.xterm-rows`, both fall back to `node: null` with container metrics.
* `terminal-selection-rects.test.ts` (new): a single-row range yields one rectangle at the picked
  columns; a multi-row range yields one per row with the middle rows full-width to their text;
  rows past the snapshot and rows the pick misses yield none; the frozen offset shifts every
  rectangle.
* `SelectionOverlay.test.tsx` (new): with a frozen node the overlay mounts that node and paints the
  rectangles, and with `node: null` it falls back to the text rows and the `.editor-sel` span.
* `useSelectionLayer.test.tsx`: a surface backed by a fake xterm screen element resolves the
  pointer through that element's grid and offset, not the container's, and exposes the frozen node.
* `terminal-selection-layer.test.ts`: the existing mapping and clamping cases, restated against
  `ScreenMetrics`, plus one where a non-zero offset shifts the cell under a point.

## Out of scope

The per-theme `--terminal-bg` / `--terminal-fg` values, which an earlier entry on this pull request
pinned to one pair across every palette — the overlay and the terminal read the same pair, so they
match either way. Selection inside xterm's own emulator selection, scrollback above the viewport,
and the highlight's extent, all unchanged.
