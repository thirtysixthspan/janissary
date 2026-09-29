# Correct the pull request's second testing step

**Complexity: 1/10** — one sentence in the pull request's description. No code.

## Goal

The description's second testing step says: after seeding `orders` in another tab, "then `sql` and
confirm `orders` is listed under **Tables** with 4 columns and the grid fills with rows." Its own first
step ends with `sql shop` on an empty database, so run in the order the steps are written the tab is
already open, and a bare `sql` focuses the tab that is there with the payload it has. The navigator
still reads `No tables.` and the grid is empty, while the database holds four rows.

The app is right. `product/specs/sql-database.md` says "Reopening keeps that tab's filters, page, and
exports; the schema is re-read only when a `Refresh` is pressed", which is a deliberate rule: a tab
that re-read everything on focus would lose the page a user was on.

The step is what is wrong, and it is wrong in a way that costs a reader the whole feature's first
impression: it is the step that proves the browser shows a seeded table.

## Approach

Put **Refresh** in the step. One control, named where the user is looking, and the same fixture then
shows `orders` as `4 cols` with its rows, all four groups in the navigator, and a trigger row that is
marked and does nothing when pressed.

The completed plan's own Verification section stays as it is: a completed plan is a historical record,
and `work-an-issue.md` in PR mode can edit the description but not another plan's text.

## Implementation steps

1. **The pull request's description** — in the **How to verify** section's second bullet, replace
   "then `sql` and confirm `orders` is listed" with "then press **Refresh** in the tab and confirm
   `orders` is listed", and leave every other paragraph of the description exactly as its author
   wrote it. The title is not touched.

## Tests

No code changes, so no test changes. What the corrected step is worth is what it proves, and it was
run against the same fixture before the correction: with **Refresh** the navigator lists `orders` at
`4 cols`, the grid fills with its four rows, and the view, index and trigger each appear under their
own group with the trigger row marked and inert.
