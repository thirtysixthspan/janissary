# PR 1129 — selection columns through terminal cells, not string indices

Complexity: 5/10

## Goal

`rangeSplitForLine` and `layerText` slice each snapshot line by string index at the
picked cell columns, but `translateToString` emits one code point for a double-width
glyph occupying two terminal cells and nothing for the cell its second half fills — so
on any line with CJK text or an emoji the string index and the cell column diverge and
the copy shifts left by one position per wide character left of the pick.

## Approach

`snapshotViewport` captures, alongside each line's text, the line's cell-to-index
mapping: walking the line's code points, advancing one cell per narrow glyph and two per
wide one (a small local predicate over code-point ranges), each cell mapping to the
string index it starts at — the second half of a wide glyph maps to the index after it,
so a pick bounded there includes the whole glyph. `rangeSplitForLine` resolves its
`from`/`to` through the mapping when one is supplied and falls back to the plain column
when it is not, which is why plain-ASCII behavior resolves exactly as it does today; the
returned `SelectionLayer` keeps its plain `snapshot` for the overlay and carries the
per-line mapping beside it.

(Accepted by the entry: combining sequences and zero-width joiners can still straddle a
boundary; the snapshot stays a plain string.)

## Implementation steps

1. `web/src/shared/terminal/terminal-selection-layer.ts`: `selectionCellIndices` walker
   over code points; `snapshotViewport` returns `{ lines, cells }`; `SelectionLayer`
   gains `cells` per line; `rangeSplitForLine` takes an optional mapping and resolves
   columns through it with the `line.length` clamp; `layerText` passes
   `state.cells[row]`.
2. `web/src/shared/terminal/useSelectionLayer.ts`: thread the walker's `cells` into the
   snapshot state.
3. Model tests: a line whose first glyph is double-width — the picked substring must be
   the characters the columns name; a plain-ASCII line resolving exactly as it does
   today so the existing single- and multi-line assertions stay valid.

Out of scope: the overlay's rendering (it consumes the plain lines unchanged); grapheme
clusters.
