# Correct the pull request description's **How to verify** for the controls this branch removed

Issue: Correct the description's **How to verify**, which still tests controls this branch removed —
eight clauses across seven steps name a **SQL** drawer, a **Copy** control, a **Stats** panel, a
per-entry **Copy**, a **Schema** / **Data** switch, a per-object `4 cols` report, and a sent-null
insert preview, none of which this branch builds. Anyone following the description cannot reproduce
the feature and reports the pull request broken when the code is behaving as designed.

Complexity: 3/10

## Goal

Every step of **How to verify** names a control the branch actually renders, and each one tests
something observable. The rest of the description is the author's statement of intent and stays
exactly as written.

## Approach

A correction to the pull request's own description, applied with `gh pr edit --body-file` after the
commit is pushed, so the description never describes a branch that does not carry the change. Seven
edits, each one the wording the backlog entry names:

- **D2** — `confirm orders is listed under **Tables** with 4 columns and the grid fills with rows`
  becomes `confirm the grid lists orders under **Tables** and shows its four columns as headers`. There
  is no per-object column count anywhere: `columnCount` in `grid-view.ts` has no caller but its own
  test.
- **D3** — the **SQL** drawer clause becomes `confirm the pager and the filter chip row show the
  range the query returned and the filter in force`. `SqlDrawer.tsx` does not exist; the range line
  and the chip row are where a filter and an order are now visible.
- **D4** — dropped. There is no copy control and no statement to copy: a selection is copied by the
  application's own copy key, which the surviving copy step already tests.
- **D5** — `and the statement is a ? with a null parameter` is dropped, the rest of the step kept.
  Nothing shows the statement a cell edit runs.
- **D11** — `that a column left alone is sent as null` becomes `that a column left alone is not named
  by the statement, so the table's own DEFAULT runs for it`. The form does still show the statement
  it will run, so that clause stays; the insert leaves an untouched column out of it entirely.
- **D13** — dropped. There is no statistics panel.
- **D14** — the per-entry **Copy** clause is dropped, and `open **SQL**` becomes `open the statement
  history beside the command bar` with the list `newest first`.
- **D16** — `showing the **Schema** / **Data** switch` is dropped and the step reads `confirm the tab
  docks in the sidebar`.

Each claim was checked against the branch before the wording was chosen: `SqlDrawer.tsx`,
`StatsPanel.tsx`, `SchemaNavigator.tsx`, and `SqlLog.tsx` are not in `web/src/plugins/sql/`, the grid
renders no copy control, and `SqlTab.tsx` has no view switch. `InsertForm.tsx` still renders the
statement it will run, and `SqlHistory.tsx` still lists newest first, so the clauses describing those
survive unchanged.

## Implementation steps

1. Remove the entry from `product/backlog/pull-request.md` — the last one, so the file returns to its
   master skeleton.
2. `pr-commit`, then `git push`.
3. Only then, `gh pr edit 1467 --body-file` with the revised body, leaving every other paragraph as
   the author wrote it.

## Tests

None. Nothing in `src/` or `web/src/` changes, so `check-diff` has nothing to run for it; this entry's
verification is the seven steps becoming reproducible, which is what the description edit is for.

## Out of scope

- `product/plans/complete/sql-database-browser.md`, whose `## Verification` section carries the same
  wording. A completed plan is the historical record of what was planned, and correcting it would
  rewrite the past rather than the instructions.
- The description's **Behavior examples** ASCII sketch, which still draws the `[<>]` and `[📊]` icons,
  a `4 col` gutter in the navigator, and a `TABLES` sidebar pane, and its **Files changed** list,
  which still names `stats.ts`, `SchemaNavigator.tsx`, `SqlDrawer.tsx`, `SqlLog.tsx`,
  `StatsPanel.tsx`, and `registry.tsx`. Both drift in the same way this entry corrects, and the entry
  names neither — a description edit that changes more than the resolved entry names would be editing
  the author's statement of intent rather than a named defect.
- The description's title, which has to match the commit subject under this repo's Conventional
  Commits rules.
- The spec and `help.md`: the description is the artifact that drifted, and the behavior it
  misdescribes is documented correctly in `product/specs/sql-database.md`.

## Specs / docs

`product/backlog/pull-request.md`, entry removed. No spec file and no `help.md` or
`documentation/user-documentation/` change — `product/specs/sql-database.md` already states every one
of these rules, and says so plainly: "There is no statistics panel", "It has no copy control", and
"It does not show the statement behind the grid, and offers no way to run one the user did not type".
