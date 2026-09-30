# Put the row actions column on the left of the table

**Complexity: 1/10** — move one cell to the front of the header row, each data row, and the filter row.

## Goal

The column holding each row's **Delete row** control is the last column of the table. On a wide table it is off the right edge until the frame is scrolled all the way across, and its position moves with the width of the data. It should be the table's first column, where it is always in the same place and on screen.

## Approach

Move the trailing gutter cell to the front of every row the table draws, so the order is the actions column, the row header, then the data columns:

- the header row's empty trailing `th` becomes the first `th`;
- each data row's actions `td` becomes its first cell;
- the filter row's trailing gutter cell becomes its first cell, so the editor stays under the columns it filters.

The row header stays beside the data it highlights. The empty row's `colSpan` counts the same columns as before, and the column fit sums both gutters wherever they are, so neither changes.

## Implementation steps

1. **`web/src/plugins/sql/DataGrid.tsx`** — the trailing `<th className="sql-gutter" />` moves to the front of the header row.
2. **`web/src/plugins/sql/GridRow.tsx`** — the actions cell moves ahead of the row header, and the row's doc comment names the new order.
3. **`web/src/plugins/sql/Filters.tsx`** — the filter row's trailing gutter cell moves to the front.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — the header row and the first data row read actions, row header, then the columns; the first cell of a writable row holds **Delete row**; the filter row's editor still sits after both gutters.

## Spec

`product/specs/sql-database.md` — Editing: **Delete row** is in the first column of every row, ahead of the row header.

## Out of scope

- Adding any other row action.
- Merging the actions column with the row header.
