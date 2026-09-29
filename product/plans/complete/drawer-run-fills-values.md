# Make the generated SQL drawer's Run fill in the values it shows

**Complexity: 3/10** — one pure rendering helper, one call site, and tests. The temptation is to
interpolate, so the work is mostly in getting the interpolation right and proving it.

## Goal

`SqlDrawer.tsx` renders `payload.grid.sql`, which carries `?` where a value was bound, and its `Run`
control sends exactly that text to the `run` intent. `DatabaseBrowser.run` prepares the statement
with no parameters, and `node:sqlite` binds each unbound `?` as NULL — so a filtered statement runs as
`WHERE "status" = NULL`, returns nothing, and reports no error. A user who filters a table, opens
the drawer to work from the statement, and presses Run concludes the filter matched nothing.

The drawer already has the values in `payload.grid.parameters`, so nothing is missing to render a
statement that runs.

## Approach

Render a runnable statement beside the one that ran, and send *that* from the control. The drawer
keeps showing the statement with its placeholders and its `Parameters` list, because that pair is the
honest record of what executed; the rendered form exists only to be run, and the control's tooltip
says which is which.

Substitution is positional — the nth `?` takes the nth parameter — and quoting has to be right,
because this is the one place in the feature where a value is written into SQL rather than bound.
Three cases, no more: a string is wrapped in single quotes with interior quotes doubled, a number is
written bare, and a null is written as the keyword `NULL`.

Positional substitution has one hazard worth naming: a `?` inside a string literal in the statement
would be consumed by the walk. The grid's own statements never contain one — every value is bound and
no literal text is interpolated — so the helper states that it substitutes into a statement the grid
produced, and the drawer's only caller is that grid.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — add and export `renderRunnableSql(sql, parameters)`:
   split the statement on `?`, and rebuild it by interleaving the parameters in order, quoting a
   string by doubling its interior single quotes, writing a finite number bare, and writing `null` as
   the keyword. A `?` with no parameter left for it is left as written, and a parameter with no `?`
   left for it is dropped, so a mismatch degrades visibly rather than silently.
2. **`web/src/plugins/sql/SqlDrawer.tsx`** — send `renderRunnableSql(payload.grid.sql,
   payload.grid.parameters)` from the `Run` control, and say in its tooltip that it runs the
   statement with the values above it filled in. Nothing else about the panel changes: the statement
   and the `Parameters` list still show what ran.
3. **`web/src/plugins/sql/grid-view.test.ts` and `SqlDrawer.test.tsx`** — the cases below.

## Tests

`grid-view.test.ts` covers the helper directly: a text value becomes a quoted literal, a numeric
value is written bare, a null becomes the keyword, a value containing a single quote is doubled
rather than truncating the statement, a statement with no placeholders is returned unchanged, and a
parameter count that does not match the placeholder count leaves both sides visible. `SqlDrawer.test.tsx`
gains a case that `Run` emits a statement carrying the bound value rather than the placeholder, and
that the panel still shows the placeholder — the two are different statements on purpose.

## Out of scope

- Changing the server. `src/database/grid-sql.ts` and the bound-parameter path are untouched: the
  grid must keep binding, and this control must never be the thing that teaches the server to accept
  an interpolated statement.
- Replacing the placeholder display. The drawer's job is to show what ran, and a rendering of it
  would be a second answer to a question the `Parameters` list already answers.
- Any escaping beyond single quotes. SQLite string literals have no other escape that matters here,
  and the helper renders values the grid produced rather than arbitrary user SQL.
