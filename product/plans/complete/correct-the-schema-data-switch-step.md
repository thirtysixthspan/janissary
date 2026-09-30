# Correct the plan's Verification step that asks for a `Schema` / `Data` switch

**Complexity: 1/10** — one clause of one completed plan's Verification bullet, and no change to the
tab.

## Goal

`product/plans/complete/sql-database-browser.md`'s Verification bullet tells a reader to confirm "a
tab opens with a `Schema` / `Data` switch (docked) or the navigator beside the grid (centre)". The tab
draws neither: it is one metadata row and one body on both layouts, and the navigator is the table
dropdown drawn in that row. The clause is dropped so the checks the rest of the bullet makes — which
are still all true — can be followed.

## Approach

Drop the clause and keep the checkable half, which is the wording the pull request's own
**How to verify** already carries and which `product/specs/sql-database.md` already states: "Docked in
a sidebar — which is narrow — it is the same tab, narrower; there is nothing to switch between, so
there is no view switch."

Each claim was checked against the branch before the wording was chosen:

- `web/src/plugins/sql/SqlTab.tsx` renders one `sql-meta` row and one body, and `docked` only adds a
  class name. There is no switch and no second pane on either layout.
- `web/src/plugins/sql/TableSwitcher.tsx` is the object list, and it is a `select`: its options sit in
  `optgroup`s labelled `Tables`, `Views`, `Indexes` and `Triggers`, drawn in that metadata row.
- The plugin says so itself, on `SqlTab.tsx`: "with one body there is nothing to switch between, which
  is why there is no Schema/Data switch here."

The pull request's description needs no correction: its **How to verify** no longer carries the clause
— `correct-the-schema-navigator-steps.md` replaced the step that named the navigator, and
`sql-pr-description-verification-steps.md` dropped the same switch from the docking step — so the stale
wording survives in this plan alone. That plan also wrote "each correction to that bullet is a separate
delivery" when it left this clause alone, and this is that delivery.

## Implementation steps

1. **`product/plans/complete/sql-database-browser.md`** — in the Verification bullet, replace
   `confirm a tab opens with a \`Schema\` / \`Data\` switch (docked) or the navigator beside the grid
   (centre), and that a fresh database shows \`No tables.\`` with
   `confirm a tab opens showing \`No tables.\``.
2. Remove the entry from `product/backlog/pull-request.md` — the last one, so the file returns to its
   master skeleton.
3. `pr-commit`, then `git push`. No description edit: the description already reads correctly, and
   editing it would change prose the entry does not need changed.

## Tests

None. Nothing in `src/` or `web/src/` changes, and what is corrected here is a document's instruction
rather than a claim about behaviour. `web/src/plugins/sql/TableSwitcher.test.tsx` already covers the
grouped options and the trigger that cannot be chosen, which is what the bullet's neighbouring clause
names.

## Out of scope

- The pull request's description, whose **How to verify** steps name only controls the tab renders.
- The plan's **Design** prose — the two-layout decision and the `Schema` / `Data` switch it planned.
  That is the record of what was planned, not a step anyone follows.
- The rest of the Verification bullet. Its other clauses have been corrected one at a time, each as
  its own delivery; this entry names the switch clause alone.
- The spec, `help.md`, and `documentation/user-documentation/`: `product/specs/sql-database.md`
  already records the rule correctly and is not what drifted.

## Specs / docs

`product/plans/complete/sql-database-browser.md`, one clause of its Verification bullet. No spec file
and no `help.md` or `documentation/user-documentation/` change.