# Correct the pull request's step that types a row number into the pager's Row field

**Complexity: 1/10** — one line of the pull request's own description.

## Goal

The seventh `How to verify` step reads:

> Type a row number into the pager's **Row** field and confirm it lands there, that a number past the
> end lands on the last page rather than an empty one, and that a non-number asks for nothing.

There is no such field. `web/src/plugins/sql/Pager.tsx` renders `Previous`, the range label, `Next`,
a `Rows` per-page select offering the payload's page sizes, and `Refresh` — and no input element at
all. A reviewer following the step finds nothing to type into, and cannot tell whether the feature is
missing or they have misread the tab, so the step stalls instead of passing.

`product/plans/complete/jump-to-a-row.md` sits in `complete/`, and the row jump this branch was
reviewed for is not on it: the branch shipped a pager without the control, and this step describes the
control the plan described rather than the one the tab draws.

## Approach

Replace the step with one that names only controls the pager does draw, and asserts the paging
behaviour that is actually there. `pageLabel` in `web/src/plugins/sql/grid-view.ts` renders
`Rows 1–50 of 120 rows` on the first of three 50-row pages, `hasNext` is false once
`offset + rows.length` reaches `total`, and `hasPrevious` is true for any `offset` above zero — so
paging to the last page is checkable from the range line and the two buttons alone.

The remedy is a correction to the pull request's own description, which is the only artifact that
carries the wrong step. Nothing in the tab, the specs, or the documentation describes a `Row` field,
so no file change is implied by it.

## Implementation steps

1. **The pull request's description** — replace the seventh `How to verify` step, after the change is
   pushed, with:

   > Set `Rows` to 50 on a table of more than 50 rows, press `Next` until the last page is showing, and
   > confirm the range line names the final page, that `Next` is disabled and that `Previous` is not.

   Every other paragraph of the description is left exactly as the author wrote it.

## Tests

None. The step corrected names controls the tab already draws, and the plan is the record of the
correction; there is no behaviour to cover, and `Pager.test.tsx` already holds the range line and the
two buttons' disabled states this step asks a reviewer to read off the screen.

## Out of scope

- `product/plans/complete/jump-to-a-row.md` — its Verification section is a historical record of a
  plan that was completed, and stays as it is.
- The pager itself. This entry reports a step that cannot be followed, not a missing control; adding a
  row jump would be a feature, and the backlog's own `features.md` is where one belongs.
- The other `How to verify` steps that name controls this branch does not draw. Each is a separate
  entry in the pull request's backlog, and each correction is its own delivery.
