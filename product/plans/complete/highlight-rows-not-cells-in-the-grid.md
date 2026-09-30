# Highlight rows in the SQL grid, never cells

**Complexity: 5/10** — the selection model is re-shaped from a rectangle of cells to a run of rows, and
the two pieces of state it is spread across are merged into one. All of it inside the SQL plugin: no
contract change, no server change, and the file navigator is the precedent for every decision.

## Goal

The grid marks individual cells. A press on a cell starts a rectangle anchored there, a drag grows it,
and the keyboard moves a two-dimensional cursor across a two-dimensional object.

A database row is the unit. Nothing in this application acts on one cell — an edit names a row and a
column because the *statement* needs both, and a copy of a rectangle is a spreadsheet habit rather
than something the tab needs. So the grid highlights rows, one press anywhere in a row highlights that
whole row, and a second press on a cell is what opens its editor.

The file navigator is the model, and this change makes the grid behave as it does: one highlighted
row, `ArrowUp` and `ArrowDown` moving it, the run scrolling to follow, `Home` and `End` reaching the
ends of the page, and `Shift` extending a run of rows.

## Approach

The selection was two pieces of state — a mouse rectangle in `selection.tsx` and a cell cursor in
`sql-keys.ts` — with a rule that the rectangle masked the cursor whenever it was not null. Row-only
highlighting leaves exactly one thing to hold, so the two become one, and the masking rule goes with
them.

- **`RowRange`** replaces `CellPosition`/`CellRange`: two row indices of the page, inclusive, and no
  column. A run of rows has no direction either, so `selectionTo` is min/max as before.
- **One state**, reset to the first row whenever a new grid arrives. That is the "highlights the first
  row on opening and after a new query" rule, and it is the same reset the old cursor had with a
  different value.
- **`sql-keys.ts` keeps the rule, loses the hook.** `nextRowSelection` is the whole navigation rule now
  — arrows, `Home`, `End`, no left or right — and it is `nextListSelection` from
  `web/src/shared/list-selection.ts` written out, which is what its comment already claimed.
- **`selection.tsx` owns the state and every listener**: the keydown listener that moves and extends
  the run, the copy listener, the reset, and the scroll-into-view effect. `DataGrid.tsx` hands it the
  scroll container's ref and reads one `selected(row)` predicate.
- **Left and right are not claimed.** They are simply absent from the navigation key set, so the
  browser's own horizontal scrolling is untouched and the highlight does not move — rather than being
  swallowed with a `preventDefault` for no effect.
- **`Enter` no longer opens an editor.** With no cell cursor there is no column for it to name, and
  the editor is a double-click.

Multi-row selection stays: `Shift` with a click, with an arrow, or with `Home`/`End` extends the run,
and the copy path is the one it has always been — one line per row, tab-separated, every cell of each.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — `RowRange`, `selectionTo` over rows, `rowRange(row, from)`,
   and `selectionToTsv(rows, range)` over whole rows. `CellPosition` and `CellRange` go.
2. **`web/src/plugins/sql/sql-keys.ts`** — `GRID_NAVIGATION_KEYS` loses the left and right arrows;
   `nextCellSelection`, `WHOLE_ROW_KEYS`, `GridKeyOptions`, and `useGridKeys` go.
3. **`web/src/plugins/sql/selection.tsx`** — the range state, the keydown listener, the reset to the
   first row, the scroll-into-view effect, `selectRow`, `clear`, and `selected(row)`.
4. **`web/src/plugins/sql/DataGrid.tsx`** — the scroll container's ref, the one `selected` predicate,
   and no `useGridKeys`.
5. **`web/src/plugins/sql/GridRow.tsx`** — `selected` is a boolean, the `<tr>` carries the class and a
   `data-row`, and a press in a cell starts a run of rows the same way a press on the row header does.
6. **`web/src/plugins/sql/sql.css`** — the highlight moves from `.sql-cell.selected` to the row.

## Tests

- **`web/src/plugins/sql/sql-keys.test.ts`** — the `nextCellSelection` describe is replaced by a
  `nextRowSelection` one: both arrows, both ends, `Home`, `End`, an empty grid, a key it does not
  answer, and a start from nothing.
- **`web/src/plugins/sql/Selection.test.tsx`** — `selectionToTsv` over rows; a press anywhere in a row
  highlights that row whole; the first row highlighted on open and after a new page; `ArrowDown` and
  `ArrowUp` moving it and stopping at the ends; `ArrowLeft` and `ArrowRight` doing nothing at all;
  `Home`/`End`; `Shift` extending and `Escape` clearing; the scroll-into-view call; a double-click
  opening one cell's editor while a press does not.
- **`web/src/plugins/sql/grid-view.test.ts`** — `rowRange` over rows.
- **`web/src/plugins/sql/DataGrid.test.tsx`** — the keyboard describe becomes the row highlight.
- **`web/src/plugins/sql/sql-style.test.ts`** — the highlight is a row rule, not a cell rule.

## Out of scope

- Copying. A highlighted row still copies as one tab-separated line, which is what it does today.
- `Tab`, which belongs to the host and still walks out of the plugin tab.
- PageUp/PageDown and type-ahead, which the file navigator has and this grid does not need on a page
  of a hundred rows.
- The read-only object's own rules for the editor, which are unchanged.
