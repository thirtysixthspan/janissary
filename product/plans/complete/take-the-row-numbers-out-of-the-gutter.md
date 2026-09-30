# Take the row numbers out of the grid's gutter

**Complexity: 1/10** — delete a cell, a table header, a prop, and one extra column from two `colSpan` counts.

## Goal

Every row opens with a cell carrying its number in the whole table. It is a fourth thing in a gutter
that already has one job — the delete control on the right — and the number in it is the page's own
indexing restated, which the pager's `Rows 1–100 of 4,213 rows` already says. It also costs a column
the table has to lay out and scroll, on a grid whose whole difficulty is horizontal space.

## Approach

Delete the leading gutter cell rather than hide it. That takes the leading `<th>` in the header, the
leading `<td>` in the filter row, and `GridRow`'s `index` prop — the one whose only job was to print
the number, and whose comment says so. `position` stays, because the selection is expressed in the
page's indices and needs the table-wide number for nothing.

The trailing gutter stays as it is: that is where **Delete row** lives.

The `.sql-gutter` rule stays, because the trailing column and the filter row's own cell still use it.

## Implementation steps

1. **`web/src/plugins/sql/GridRow.tsx`** — drop the leading gutter cell, the `index` prop, and the
   sentence about what `index` is for.
2. **`web/src/plugins/sql/DataGrid.tsx`** — drop the leading `<th className="sql-gutter" />`, the
   `index` prop at the `GridRow` call, and the `grid?.offset` arithmetic that fed it. The empty row's
   `colSpan` counts one fewer column.
3. **`web/src/plugins/sql/Filters.tsx`** — the filter row's leading gutter cell goes with the column
   it aligned under.
4. **`web/src/plugins/sql/sql.css`** — unchanged: the rule is the trailing gutter's, which stays.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — the grid shows no row numbers, and the empty row's
  `colSpan` still spans every column the table has.
- `web/src/plugins/sql/Selection.test.tsx` — the cell helper filters out the gutter, so a selection
  case is the one place a stray leading cell would show up as an extra selected cell; its existing
  cases cover that once the column is gone.

## Spec

None. `product/specs/sql-database.md` describes the grid's header, its filter chip row, the pager and
the row controls, and never mentions a number in a gutter — there is nothing in it to correct.
