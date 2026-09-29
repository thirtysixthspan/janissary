# One row index space for the selection and the page

**Complexity: 3/10** — two prop names in two components and a test case that the existing fixture
could already have taken.

## Goal

`DataGrid.tsx` passes each row `index + (grid?.offset ?? 0)` to `GridRow`, which is the row's
number in the whole table — the right number for the gutter. `GridRow` also hands that same number
to `selection.select` and `selection.selected`, which store it as the selection's row.
`selectionToTsv` in `grid-view.ts` then indexes `rows[row]` with it, where `rows` is the page's own
array.

On the first page `offset` is 0 and the two coincide. From the second page on, every selected row is
at least `offset`, and `selectionToTsv` clamps `lastRow` to `rows.length - 1` and gives up when that
is below `firstRow` — so it returns `''`, `copy` returns early, and neither the Copy control nor the
platform's copy key writes anything. The cells still highlight, because the highlight compares two
values that use the same wrong number.

Every copy case in `Selection.test.tsx` renders the offset-zero payload, which is why this has never
been caught.

## Approach

Keep both numbers and label them for what each is. The gutter wants the row's place in the table;
the selection wants its place in the page, because that is the array the copy reads.

## Implementation steps

1. **`web/src/plugins/sql/GridRow.tsx`** — take `index` (the row's number in the table, for the
   gutter) and `position` (its index in the page) as separate props, and use `position` in the
   `selection.select` and `selection.selected` calls. Update the doc comment on the component to say
   which is which, since the two names are one character apart and the mistake is invisible.
2. **`web/src/plugins/sql/DataGrid.tsx`** — pass the page-relative loop index as `position` and the
   offset-shifted one as `index`.

`web/src/plugins/sql/grid-view.ts` needs no change: `selectionToTsv` is correct for a page-relative
index, and this change is what finally hands it one.

## Tests

- `web/src/plugins/sql/Selection.test.tsx` — in the `copying a selection` block, add a case that
  renders `payload({ offset: 100 })`, makes the same run over the first two cells, and expects the
  same tab-separated text the offset-zero case produces. Reuse the `withRun` shape by giving it the
  payload to render.

`product/specs/sql-database.md` needs no change — it says a range that runs off the end of the page
copies only what was on screen, which stays true.
