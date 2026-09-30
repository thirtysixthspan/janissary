# Truncate values that do not fit instead of widening the table

**Complexity: 4/10** — a measured width cap the stylesheet applies to every data cell, a hook that keeps it current, and tests for the arithmetic, the measurement, and the rules.

## Goal

A table with more columns than the frame has room for lays out every column at the full width of its longest value, so the grid scrolls sideways even when the only wide thing in it is one long text value. When the columns do not all fit, a value should be cut off with an ellipsis so its column can shrink, and the table should fit the frame wherever the column names allow it to.

## Approach

When the columns do not all fit, every data cell is given the same maximum width — the cap — chosen as the widest that lets the table fit the frame. A column whose values are all narrower than the cap keeps its own width, so the cut falls on the widest columns first. The column headers are not capped, so a column never shrinks past its own name, and a table too wide even with every value cut to its column's name still scrolls sideways, which is the only way to reach a column at all. When the columns fit, no cap is set and the table lays itself out exactly as before.

The stylesheet reads the cap from one custom property on the scroll frame: `max-width: var(--sql-cell-cap, none)` with `overflow: hidden` and `text-overflow: ellipsis` on each data cell.

The cap is worked out from measurements rather than left to the table:

- each column's floor is its header's content width, and its natural width is its widest value's content width, both read from a `Range` over the content — a cell's own box is stretched in a table that fits and clipped in one that does not, and neither is how wide its value is;
- the room is the frame's width less the two gutters, each data cell's padding, and one pixel kept back for rounding;
- the cap is the largest integer for which the columns, each `max(floor, min(natural, cap))`, fit the room — found by bisection, since the total only grows with the cap.

A hook re-fits before paint whenever the page, the hidden columns, or the cell being edited change, and whenever a `ResizeObserver` reports the frame resized — a dock dragged wider or a split pane. Without `ResizeObserver` (a test environment with no layout) it does nothing, as `useToastPosition` already does.

Rejected: `max-width: 0` on every data cell with no measurement. It fits the table, but Chromium then shares the width in proportion to the column names rather than the values, so measured on a 600px frame a 400-character column got 199px while an `id` column holding `1` got 121px.

Three details come with it:

- The cell a double-click opened carries an `editing` class and is exempt from the cap, so the editor is never clipped.
- A foreign-key value is drawn as a link button inside the cell, so the button truncates the same way.
- A cut-off value has to be readable somewhere, so each data cell carries the full value as its tooltip.
- The row header gains `min-width: 2em`: a fitted table is laid out at its columns' narrowest, which otherwise squeezes the empty header to its padding.

## Implementation steps

1. **`web/src/plugins/sql/column-fit.ts`** (new) — `cellCap(columns, room)`, `measureColumns(frame)`, and `fitColumns(frame)`, which sets or clears `--sql-cell-cap` on the frame.
2. **`web/src/plugins/sql/useColumnFit.ts`** (new) — the layout effect and resize observer.
3. **`web/src/plugins/sql/DataGrid.tsx`** — call `useColumnFit` with the scroll frame, the page, the hidden columns, and the edited cell.
4. **`web/src/plugins/sql/GridRow.tsx`** — the data cell's class gains `editing` while its editor is open, and the cell carries `title` set to the value the grid shows.
5. **`web/src/plugins/sql/sql.css`** — the capped data-cell rule, the editing exemption, the truncating link, and the row header's minimum.

## Tests

- `web/src/plugins/sql/column-fit.test.ts` (new) — the cap is null when everything fits, cuts the widest column to what the narrow ones leave, is the widest cap that fits, and is zero when not even the names fit; `fitColumns` sets and clears the property from a stubbed layout; `useColumnFit` fits on arrival, on a resize, and on a new page, and disconnects its observer on unmount.
- `web/src/plugins/sql/sql-style.test.ts` — the data cell rule reads the cap and truncates with an ellipsis; the editing cell is exempt; the header is never truncated; the row header keeps its width.
- `web/src/plugins/sql/DataGrid.test.tsx` — a data cell's tooltip is its full value, a null's reads `NULL`, and the cell being edited is marked `editing`.

The layout itself was checked in Chromium through the attached browser: a table that fits keeps its widths, a 400-character column is cut to exactly the frame, a foreign-key column truncates with its link, and a 30-column table still scrolls.

## Spec

`product/specs/sql-database.md` — What the tab shows: a value that does not fit is cut off with an ellipsis and shown whole in its tooltip, the widest columns are cut first, columns never shrink past their names, and a table too wide for that still scrolls sideways.

## Out of scope

- Resizing columns by dragging, or remembering column widths.
- Truncating the column names themselves.
