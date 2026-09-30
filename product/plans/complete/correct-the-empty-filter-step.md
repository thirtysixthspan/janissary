# Correct the step that expects both totals to be zero on an empty filter

**Complexity: 1/10** — one step of the pull request's own description.

## Goal

The sixteenth `How to verify` step ends: "filter a table to nothing and confirm the pager reads
`No rows.` and both totals are zero; page past the end and confirm **Next** disables."

The pager prints no totals at all for an empty page. `pageLabel` in
`web/src/plugins/sql/grid-view.ts` returns the bare string `No rows.` the moment
`grid.rows.length` is zero, before it reaches the range line that would carry a count — and the grid
header beside the object name reads the same sentence, because it calls the same function. There is
one figure on screen, and it is not a total.

What the grid holds behind it is a filtered `0` against an object of four rows, so "both totals are
zero" is not true of the data either: one of the two figures is the filtered count and the other is
the object's size, and only the first is ever zero here. A reviewer hunting for two zero figures
finds one label, and cannot tell whether the counts are broken or simply not shown for an empty page.

## Approach

Assert the two things the pager does promise. For an empty result it promises the one word `No rows.`
and the way back: **Clear filters** is a control on the chip row the tab draws, and clearing it
brings the rows the filter removed. Paging is a separate claim, and it holds — `hasNext` is false once
`offset + rows.length` reaches `total` and `hasPrevious` is true for any `offset` above zero, so a
reviewer can read the last page off the two buttons.

The step's second half was already checkable and is kept, with the disabled state named on both
buttons so there is one unambiguous thing to look at.

## Implementation steps

1. **The pull request's description** — replace the sixteenth `How to verify` step, after the change is
   pushed, with:

   > Empty edge cases: filter a table to nothing and confirm the pager reads `No rows.` and that
   > clearing the filter brings the rows back; on a table of more than one page, page to the last and
   > confirm `Next` is disabled while `Previous` is not.

   Every other paragraph is left exactly as the author wrote it, and the title is not touched.

## Tests

None. The step corrected describes a control the tab already draws; `Pager.test.tsx` and
`DataGrid.test.tsx` already hold the empty page's `No rows.`, the `Clear filters` intent and the two
buttons' disabled states.

## Out of scope

- `pageLabel`. This entry reports a step that cannot be followed as written, not a missing figure:
  the spec promises a range line reading `Rows 1–2 of 3 of 51,882 rows` once a filter is narrowing,
  and prints no totals for an empty page rather than printing two zeroes.
