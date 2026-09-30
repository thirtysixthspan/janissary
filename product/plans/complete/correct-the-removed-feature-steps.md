# Correct the steps for the statement history, the SQL drawer and the statistics panel

**Complexity: 1/10** — three clauses of a plan's verification line, one step of the pull request's own description.

## Goal

The twelfth `How to verify` step opens "the statement history beside the command bar" and empties it
with **Clear log**, and the browser plan's manual Verification bullet confirms a `SQL` drawer carrying
`Parameters` and **Copy**, a generated statement shown as a `?` with a null parameter, and a **Stats**
control reading `Too many distinct values to chart.`

None of the three exists anywhere in the tab. Its controls are `Insert row`, `Columns`, `CSV`,
`JSON`, the split control, the per-column order and filter buttons, the per-row **Delete row**
buttons, `Previous`, `Next` and `Refresh`; no element carries a class mentioning history, log or
statement, there is no **Clear log**, and the strings `Parameters`, `Copy`, `Stats` and
`Too many distinct values to chart.` are drawn nowhere.

These were deliberate removals, recorded in `product/specs/sql-database.md`:

- "There is no second list of the tab's statements anywhere in the tab, and no control that empties
  one. What a statement produced is in the notifications feed, and the tab keeps nothing of its own."
- "There is no statistics panel."
- "It does not show the statement behind the grid, and offers no way to run one the user did not
  type. The console is the only place SQL is entered."

So a reviewer following the description's step either skips it or reports the feature as missing when
the branch dropped it on purpose.

## Approach

Point the step at the two things that do hold a statement's history. The console is a
`CommandBarShell` wired to the shared keymap with the statements it has sent as its recall list, so
`ArrowUp` walks them back into the line without running anything
(`web/src/plugins/sql/SqlConsole.tsx`), and a statement's outcome is a notification — `OK.`, a changed
row count, `Query returned 12 rows.`, or the SQLite error that stopped it — in the feed.

In the plan's manual step, drop the three clauses about the drawer, the generated statement and
**Stats** while keeping the checks in the same sentences that still hold: the filter and sort, the
**NULL** cell in its muted style, and everything after them.

## Implementation steps

1. **`product/plans/complete/sql-database-browser.md`** — in the Verification bullet, drop the three
   clauses:
   - `and confirm the \`SQL\` drawer shows a \`?\` placeholder and the bound value listed under \`Parameters\`; press \`Copy\` and paste into a scratch file to confirm the pair came across`,
   - `and that the generated statement is a \`?\` with a null parameter, not the four characters`,
   - the whole sentence `Open **Stats** and confirm one bar per value for a low-cardinality column,
     and \`<n> distinct\` under \`Too many distinct values to chart.\` for a high-cardinality one`.
2. **The pull request's description** — replace the twelfth `How to verify` step, after the push, with:

   > Edit a few rows, then press `ArrowUp` in the `SQL >` console and confirm each statement you sent
   > comes back into the line without being run, and confirm the notifications feed lists what each
   > statement changed or the SQLite error that stopped it.

   Every other paragraph is left exactly as the author wrote it, and the title is not touched.

## Tests

None. Both artifacts describe controls the tab does not draw; `SqlConsole.test.tsx` already covers
the recall walk, and the outcomes the feed carries are covered by the plugin's own notification cases.

## Out of scope

- The tab. This entry reports steps for features the branch deliberately removed, not a defect in
  what it ships, and `product/specs/sql-database.md` records each removal as a decision.
- The description's `### What` and `### Files changed` sections, which also name a statement log, a
  generated-SQL drawer and a statistics panel among what the branch adds. Correcting a promise in
  prose is a separate call from correcting a checkable step, and this entry names the step.
