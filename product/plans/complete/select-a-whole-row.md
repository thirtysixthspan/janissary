# Let a whole row be selected, moved by keyboard, and copied

**Complexity: 4/10** — one pure range rule, one row-header control, a key pair on the existing cursor, one escape that clears both marks, five test cases.

## Goal

A row cannot be selected. Selection is a rectangle of cells, and there is no way to say "this row" —
the gutter in front of each row used to carry its number and now carries nothing at all, so a whole
row is reachable only by dragging across every column of it, on a grid whose difficulty is that there
are too many columns to drag across.

A row is the unit people copy out of a database. Selecting it, moving it with the keyboard the way
the file navigator moves a file, and copying it as one line is three requests that are really one.

## Approach

The selection is already a rectangle, and a whole row is the widest rectangle the grid has. Nothing
new is needed to *represent* it — `{row, cell: 0}` to `{row, cell: last}` is one line of TSV, which
is exactly what a row should paste as. So the work is in reaching it.

**By mouse**, through a row header: a narrow cell in front of each row, which is where the number
used to be and is where a data grid's row selector belongs. A click puts the whole row in the
selection, a shift-click extends it, and a drag across headers extends it the way a drag across
cells already does. It is the delete column's counterpart rather than a replacement for it.

**By keyboard**, through `Shift` with the four keys the file navigator already answers. The rule is
`nextListSelection` — arrow by one, stop at the ends, `Home` and `End` to the ends — written out in
`sql-keys.ts` rather than imported, because a client plugin may not reach `web/src/shared/`. It is
deliberately the same rule and not an adaptation: a row selection is one-dimensional, so there is
nothing to stretch. `Shift+ArrowDown` from any cell selects that row whole; the next one extends by a
row and stays full width, which is what extending a whole-row selection has to mean. The edge a key
moves is the end of the run already in progress where there is one, and the cell cursor's row where
there is not — so a second press extends rather than restarting on the same row.

The two marks are one state, not two. The keyboard cursor is what the arrows move and what a range
does not exist to show; a full-width range reads as a row selection, and `Escape` clears both, so
there is no way to be left with a hidden cursor and a mark nobody asked for.

Nothing changes about copying. `selectionToTsv` already emits one line per row of a run, so a whole
row copies as one tab-separated line through the **Copy selection** control and the platform's own
copy key alike.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — a `CellRange` name for the rectangle the selection already
   is, `selectionTo` returns one, and `rowRange` builds the full-width run for a row, extending a
   range already in progress.
2. **`web/src/plugins/sql/selection.tsx`** — `selectRow(row, extend)`, the same rectangle, chosen by
   whole row rather than by cell.
3. **`web/src/plugins/sql/sql-keys.ts`** — `WHOLE_ROW_KEYS` and `nextRowSelection`, the file
   navigator's rule; the listener answers them before the plain arrows, reads the edge to move from
   the new `edgeRow` option, and `Escape` clears the selection as well as the cursor through a new
   `onClear`.
4. **`web/src/plugins/sql/GridRow.tsx`** — the leading gutter cell is back as a row header: no text, a
   **Select row** tooltip, and the mousedown and mouseenter pair the cells already use.
5. **`web/src/plugins/sql/DataGrid.tsx`** — the header's and the filter row's leading gutter cells
   come back with the column, the empty row's `colSpan` counts it again, `GridRow` takes
   `onSelectRow`, and `onClear` is wired to the selection.
6. **`web/src/plugins/sql/sql.css`** — the row header's width, its pointer, and its hover.
7. **`product/specs/sql-database.md`** — the editing section's paragraph on selection says a row can
   be selected whole, how the keyboard moves it, and what it copies as.

## Tests

- `web/src/plugins/sql/grid-view.test.ts` — `rowRange` is a full-width one-row run, and extending one
  from an existing anchor covers the rows between and stays full width.
- `web/src/plugins/sql/DataGrid.test.tsx` — the header and row cases are re-asserted against the row
  header that is back in the gutter, and the empty row's `colSpan` counts it again.
- `web/src/plugins/sql/Selection.test.tsx` — a click on a row header selects every cell of that row
  and no other, a shift-click extends it to the next row, `Shift+ArrowDown` does the same from the
  keyboard and stops at the ends, a whole row copies as one tab-separated line, and `Escape` leaves
  nothing marked.
