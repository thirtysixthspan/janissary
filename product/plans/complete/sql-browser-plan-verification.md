# Correct the sql browser plan's Verification step, which asks for three columns from a four-column table

**Complexity: 1/10** — one sentence of prose in one completed plan file, plus a check of every other
claim in the same paragraph against the code it describes. No behavior, no test, no spec.

## Goal

`product/plans/complete/sql-database-browser.md`'s manual **Verification** step becomes a set of
instructions a reader can actually follow: the navigator's column count it asks for is the count the
navigator reports, and the statistics step names the words the panel puts on screen rather than
describing them.

## Approach

The step builds `orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, status TEXT, total REAL)`
— four columns — and then asks the reader to confirm the grid lists `orders` "with its three
columns". Three was the count of an earlier draft of that example table, before `total` was added,
and it was never re-counted. The plan's own **Behavior examples** block draws the same object as
`orders 4 col`, and `columnCount` in `web/src/plugins/sql/grid-view.ts` writes `<n> col` or
`<n> cols` from the object's own column list, so the figure a reader sees is `4 cols`.

The step therefore names `4 cols` rather than a number to count for themselves: the point of the
step is that the navigator agrees with the schema, and a spelled-out figure is the thing it can be
checked against.

The same paragraph's statistics step says to "confirm bars for a low-cardinality column and a
distinct count for a high-cardinality one". Both render, but a reader looking for them will not find
those words: `StatsPanel` puts `<n> distinct` in the summary line and `Too many distinct values to
chart.` where the bars would be. The step names both.

## Implementation steps

1. `product/plans/complete/sql-database-browser.md`, **Verification**: the column count, and the
   statistics step's wording.

## What was checked and left alone

The rest of the paragraph was re-read against the code and holds:

- `No databases. Create one with: db sqlite create <name>` is `NO_DATABASES` in
  `src/plugins/sql/tabs.ts`; `No tables.` is what `SchemaNavigator` renders for an empty object list;
  the navigator's four groups are `table`, `view`, `index`, `trigger`, in that order.
- The `SQL` drawer shows `?` placeholders with a `Parameters` line, and `Copy` writes the pair.
- Editing starts on double-click (`onDoubleClick` in `GridRow.tsx`), the editor's null toggle is
  labelled `Set NULL` and renders the cell as a muted `NULL`.
- `readOnlyReason` writes `Read-only: "<name>" has no primary key.` for a keyless table and
  `Read-only: "<name>" is a view.` for a view, and `DataGrid` drops the write affordances for both.
- Exports land under `.janissary/db/exports/` through `dbExportDir()` in `src/connections.ts`, and the
  header links each one through `capabilities.resourceUrl`.
- `sql <name> left` docks, a bare `sql` undocks, and a second `sql <name>` focuses the tab already
  open, all through `openDatabase` and `parseOpenCommand`.
- The last step's two claims — a write intent against a read-only payload rejecting with the plugin
  still enabled, and a malformed intent payload failing the RPC without a `Tab plugin "sql" disabled:`
  line — are what `src/plugins/sql/activate.test.ts` asserts.

The seven follow-up features this branch added after the plan was written — the statement log, the
copy of a selection, the row jump, hidden columns, **Insert row** as a form, the foreign-key follow,
and the all-column search — have no manual step here. That is left as it is: the pull request's own
**How to verify** is the live account of them, and rewriting a completed plan's Verification to
duplicate it is a different piece of work from the stale count this entry names.

## Out of scope

- Every other paragraph of the plan, including its **Tests** list, which names several test files that
  the implementation consolidated elsewhere (`SqlTab.test.tsx` covers the grid, the navigator, the
  drawer and the console). Correcting that list is the same class of drift and is not what this entry
  reports.
- A test for a count in prose, which is the wrong instrument: what catches it is checking each
  **How to verify** claim against the fixture it names, which is the review task's own job.
