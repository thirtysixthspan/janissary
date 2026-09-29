# Let the pager jump to a row the user names

**Complexity: 2/10** — one helper and one control, with no server change at all.

## Goal

The pager offers only Previous and Next, so reaching row 40,000 of a 51,882-row table takes 408
clicks. A user inspecting one specific record near the end of a large table gives up on the browser
and falls back to a hand-written `LIMIT`/`OFFSET` in the console — which is the work this feature
exists to remove.

DB Browser for SQLite carries a navigate-to-row control beside its first/previous/next/last pair for
the same reason.

## Approach

The whole feature is the offset arithmetic, so it is a pure helper beside `previousOffset` and
`nextOffset`, and the pager emits the `set-page` intent that already exists.

Two decisions are worth stating:

- **Rows are numbered from 1**, because that is how `pageLabel` already numbers them. A number the
  user reads off the label has to mean the same row when typed back in, or the control would be
  lying about its own units.
- **Past the end clamps to the last page** rather than rounding up past it. A typed number the user
  got wrong should land them at the end and show them that, not show an empty page that looks like
  the table is empty. The range label is left where it is precisely so they can see where they
  landed rather than having to trust the number they typed.

A row that is not a whole number above zero returns `null`, which asks for no page at all — so the
control can sit there unchanged until the number makes sense, rather than rounding `abc` to a page.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — `goToRow(value, grid)`, returning an offset or null.
2. **`web/src/plugins/sql/Pager.tsx`** — the field and its control, between the range label and the
   page-size selector so it sits in the same row as the navigation it augments rather than up in the
   grid header.

## Tests

`web/src/plugins/sql/grid-view.test.ts` covers the first row, a page boundary, a middle row, the last
row, past the end, an empty object, a page size other than the default, and every shape of input that
names no row. `web/src/plugins/sql/Pager.test.tsx` — new — covers the control and Enter both
emitting `set-page` with the computed offset, a number naming no row emitting nothing, the control
disabled until a row is named, the range label surviving, and Previous/Next still working.

## Out of scope

- Jumping to a row by a *primary key* value rather than a position. That is a filter, and the grid
  already has one.
- A first/last pair beside the field. The field covers both, and a control that duplicates it is a
  control with its own state to keep in step.
