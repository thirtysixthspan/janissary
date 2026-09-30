# Correct the steps that expect a schema navigator with a marked trigger row

**Complexity: 1/10** — one clause of a plan's verification line, one step of the pull request's own description.

## Goal

The second `How to verify` step, and the matching clause of
`product/plans/complete/sql-database-browser.md`'s Verification, both describe a schema navigator: a
panel that lists objects under group headings, reports each object's column count as `4 cols`, and
carries a marked trigger row that does nothing when clicked.

`web/src/plugins/sql/TableSwitcher.tsx` is the object list, and it is a `select`. Its options sit in
`optgroup`s labelled `Tables`, `Views`, `Indexes` and `Triggers`, so each kind really does appear
under its own group and choosing an object really does put its columns up as headers — but the string
`4 cols` is drawn nowhere, and there is no trigger row to click: a trigger is a `disabled` `option`,
which is the only way a select can say "listed but not browsable".

A reviewer looking for a navigator finds a dropdown, cannot confirm the column count or the inert
trigger from it, and so reads two thirds of the step as uncheckable and the rest as a failure.

`product/specs/sql-database.md` already records what ships: "The table dropdown lists every table,
view, index, and trigger in the database, grouped in that order. A trigger is listed but cannot be
chosen." The steps are behind it, not the tab.

## Approach

Replace the claim in each place with the one the tab can be checked against: the dropdown's own
groups, the columns that come up as headers when an object is chosen, and the trigger's option being
unchoosable. The grouped-lists-each-kind half of the original step was already true of the dropdown
and is kept, since a correction should not drop a check that passes.

This is a correction to two documents and no change to the tab. The description is corrected after the
change is on the branch, since a description edited earlier would describe work the branch does not
carry.

## Implementation steps

1. **`product/plans/complete/sql-database-browser.md`** — in the Verification bullet, replace
   `confirm the grid lists \`orders\` under **Tables** with its four columns, reported as \`4 cols\``
   with `choose \`orders\` from the table dropdown and confirm its four columns come up as headers`.
2. **The pull request's description** — replace the second `How to verify` step, after the push, with:

   > In another tab run `db sqlite query shop "CREATE TABLE orders (id INTEGER PRIMARY KEY, customer
   > TEXT NOT NULL, status TEXT, total REAL)"` and a few `INSERT`s, then press **Refresh** in the tab,
   > choose `orders` from the table dropdown and confirm its four columns come up as headers. Add a
   > `CREATE VIEW`, a `CREATE INDEX`, and a `CREATE TRIGGER` through the console, press **Refresh**
   > again, and confirm each appears under its own group in that dropdown, and that the trigger's
   > option cannot be chosen.

   Every other paragraph is left exactly as the author wrote it, and the title is not touched.

## Tests

None. Both artifacts are documents describing a control the tab already ships;
`web/src/plugins/sql/TableSwitcher.test.tsx` already covers the grouped options and the trigger that
cannot be chosen.

## Out of scope

- The rest of the plan's Verification bullet, including its two-layout `Schema` / `Data` wording. It
  is wrong in the same way, but this entry names the column-count clause, and each correction to that
  bullet is a separate delivery.
- `TableSwitcher.tsx`. The entry reports a step that cannot be followed as written, not a missing
  column count or a missing mark beside a trigger; adding either would be a feature.
