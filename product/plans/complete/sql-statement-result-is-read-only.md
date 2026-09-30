# A statement's result is read-only, so a click writes nothing

Issue: Stop a console result's grid from writing refused statements into the log on every click —
`readStatement` mints every row of a console result with `key: ''`, and `GridRow`'s editor test is
`editing?.row === row.key`, so one double-click opens an editor in every row at once, the first blur
commits, and `updateCell` refuses the empty key — one `That row is no longer loaded.` error band, two
notifications, and two log entries per click, in a log that is otherwise the browser's only record of
what was written.

Complexity: 3/10

## Goal

A statement's result is read-only the way a view is, with its own reason, and says so. One optional
boolean on the grid view carries the server's own knowledge that the rows are keyless; the tab reads
it in the one place it already decides whether the object on screen can be written to, so the
editor, **Delete row**, and **Insert row** all disappear together as they already do for a view.

## Approach

- `src/protocol/database.ts`: `DatabaseGridView` gains `keyless?: boolean` — the server's statement
  that this result's rows carry no row identity. `consoleGrid` sets it, since it already builds every
  row with `key: ''` and already says in its own comment that "a console result is not a page to
  edit". A page from an object leaves it absent, so `runGrid` and `emptyGrid` are untouched.
- `src/plugins/sql/shared.ts`: `SqlGrid` gains the same field and `isGrid` accepts it, exactly as it
  now does for `truncated`.
- `web/src/plugins/sql/grid-view.ts`: a pure `statementResult(grid)` reading that flag, and
  `readOnlyReason` takes it as a second argument — `Read-only: this is a statement's result, not a
  table.` is that function's whole job, and a caller that already has the object should not have to
  compose a second one beside it. The argument defaults to `false` so the object-only cases and their
  tests are unchanged.
- `web/src/plugins/sql/DataGrid.tsx`: one `statementResult(payload.grid)` feeds `readOnlyReason`, the
  `deleting` prop, and the two `onEdit` guards — the double-click and the keyboard cursor, which
  would otherwise open the same editor by a different route.
- `web/src/plugins/sql/SqlTab.tsx`: **Insert row** joins the same condition. This is the branch's
  own rule rather than a new one: the spec already says a read-only object "offers no edit, insert,
  or delete control at all", and a statement's result is read-only for the same reason a view is —
  there is no statement that addresses one row of it.
- The flag is carried rather than inferred from the row keys on purpose. A heuristic over
  `row.key !== ''` reads a console result that returned nothing as a writable page, so the same
  statement would offer **Insert row** and show no reason depending on how many rows came back. The
  server is the only side that knows, and it already says so in the shape `truncated` uses.

## Implementation steps

1. `src/protocol/database.ts` and `src/database/console-read.ts`: add and set `keyless`.
2. `src/plugins/sql/shared.ts`: the field and its guard.
3. `web/src/plugins/sql/grid-view.ts`: `statementResult` and `readOnlyReason`'s second argument.
4. `web/src/plugins/sql/DataGrid.tsx`: the reason, the delete affordance, and both edit guards.
5. `web/src/plugins/sql/SqlTab.tsx`: **Insert row**'s condition.
6. `./scripts/run.mjs check-diff`.

## Tests

- `src/database/browser.test.ts`: a console read's grid carries `keyless: true`; a grid query's page
  does not, since the flag is what tells the two apart and a flag always set would make every page
  read-only.
- `src/plugins/sql/shared.test.ts`: a grid carrying `keyless` passes `isSqlPayload`, and a non-boolean
  does not.
- `web/src/plugins/sql/grid-view.test.ts`:
  - `readOnlyReason(object, true)` reads the statement's reason, and beats the object's own writability
    — a writable table's name must not win over "this is a statement's result".
  - `readOnlyReason(object)` is unchanged for every object case already covered.
  - `statementResult` is true for a keyless grid, false for a page, false for no grid.
- `web/src/plugins/sql/DataGrid.test.tsx`: a keyless grid renders the reason, renders no **Delete
  row**, and a double-click on a cell opens no editor and sends no intent — the regression itself.
- `web/src/plugins/sql/SqlTab.test.tsx`: a keyless grid hides **Insert row**, and a page of a
  writable object keeps it.

## Out of scope

- Minting real row keys for a console result. A statement is not necessarily about one table, so a
  `SELECT` over a join or an aggregate has no row to hand an identity to.
- The console's own writes, which stay exactly as they are: the spec already says the console still
  writes to a read-only object, and a statement the user typed is a write they asked for.
- `Copy`, selection, and export, all of which work on a statement's result and should keep doing so.

## Specs / docs

- `product/specs/sql-database.md`, **Editing**: the read-only paragraph names a statement's result
  alongside a view and a keyless table, and gives its reason.
- `product/specs/sql-database.md`, **The console**: says a read fills the grid with a result that is
  read-only, pointing at the Editing section for why.
- No `help.md` or `documentation/user-documentation/` change: no page describes which controls the
  grid offers for a statement's result.
