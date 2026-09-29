# Follow a foreign key from a cell to the row it points at

**Complexity: 4/10** — one more pragma read per object, three fields across two contracts, and one
new control in the grid. The interesting part is ordering: a jump has to select the table *and*
filter it as one request, not two.

## Goal

The grid renders every column as plain text, so a `customer_id` carrying `42` gives no hint that a
`customers` row is behind it. Reading a normalized schema in this grid means holding the id and
mentally joining it — the one job the navigator beside the grid exists to remove.

DB Browser for SQLite reads the key clause, shows a tooltip naming the referenced table, and jumps to
the referenced row. That is the shape to copy.

## Approach

Read the key clause where the columns are already read, and carry it on the column.

`PRAGMA table_info` does not return it; `PRAGMA foreign_key_list` does, one row per key column,
grouped by `id` and ordered within a group by `seq`. So a second pragma in `objectColumns` fills in
what `table_info` cannot, and the two merge by column name.

The jump is one intent, not two. The obvious sketch — send `select-object` then `set-filter` — is
wrong here, and the reason is worth stating: `topicAction` is fire-and-forget and the tab's payload
only changes when the answer arrives, so a `set-filter` sent immediately after `select-object` would
build its query against the *old* object and filter the table the user just left. So the filter rides
inside `select-object`, and the handler applies it to the payload before issuing the query. That is
one request whose state is the state the tab will hold — the same invariant the rest of the intent
table already keeps.

## Implementation steps

1. **`src/database/schema.ts`** — read `PRAGMA foreign_key_list(<object>)` alongside
   `PRAGMA table_info`, group its rows by `id`, order each group by `seq`, and give
   `DatabaseColumnView` a `references` field holding the referenced table and its columns. A column
   with no key has none.
2. **`src/protocol/database.ts`** — declare the same field on the view type, so the shape crosses the
   wire by declaration rather than by shape agreement.
3. **`src/plugins/sql/shared.ts`** — mirror it on `SqlColumn` and extend `isSqlPayload`'s column
   check, so a payload carrying a malformed reference is rejected like any other malformed part.
4. **`src/plugins/sql/shared-intents.ts`** — widen `SelectObjectIntent` to carry an optional
   `column` and `value`, so the same intent expresses "show me this table" and "show me this table
   filtered to this value", and widen its guard. The two halves are required together: a `column`
   with no `value` would filter on `undefined`, and a `value` with no `column` would filter on
   nothing, so either alone is refused rather than quietly dropped.
5. **`src/plugins/sql/intents.ts`** — have the `select-object` handler apply any carried filter to
   the payload before it issues the query, so the action is built from the state the tab will hold.
   A carried filter replaces any existing filter on that column and leaves other columns' alone.
6. **`web/src/plugins/sql/DataGrid.tsx`** — render a cell whose column has a `references` as a
   control rather than text: its title names the referenced table and column, and activating it
   sends `select-object` carrying the reference and the cell's text. A null cell offers nothing,
   because there is nothing to follow, and so does a reference whose target column could not be
   resolved.

## Tests

`src/database/schema.test.ts` covers a single-column key, a composite key pairing on `id` across two
`seq` values, a column with no key, a key that names no target column resolving to the referenced
table's own primary key, one that cannot be resolved and so carries an empty target, and a
self-reference. `src/plugins/sql/activate.test.ts` covers the widened intent: selecting a table with
no filter behaves as before, selecting with a filter issues one query whose object *and* filter are
both the new ones — the case that would have caught the two-intent ordering bug — a carried filter
replaces rather than duplicates, other columns' filters survive, and half a filter is refused.
`src/plugins/sql/shared.test.ts` covers the column guard and the intent guard.
`web/src/plugins/sql/DataGrid.test.tsx` covers a keyed cell emitting the widened intent, its title,
a cell with no key staying plain text, and a null or unresolved key offering nothing.

## Notes from the build

- A key that names no target column comes back from the pragma with a null `to`, and resolving it
  needs the referenced table's own primary key. That lookup reads `PRAGMA table_info` directly rather
  than going through `objectColumns`, because `objectColumns` calls the key reader — a self-referencing
  table would recurse until the stack ran out. `objectColumns` is now the only entry point that reads
  both pragmas.
- The composite-key case exposes an ambiguity worth stating rather than papering over: a key that
  omits its target names the referenced table's *whole* primary key, and when that key is composite
  there is no single column to filter on. The reference is carried with an empty target, and the
  grid treats that as a key it cannot follow instead of guessing one column and filtering wrongly.

## Out of scope

- Following a key backwards, from the referenced table to the rows pointing here.
- Editing a keyed cell from a list of valid values, which DB Browser for SQLite also does. It is a
  different control with its own query and its own failure mode, and this finding is about reading a
  schema, not constraining a write.
- The key column's own type. SQLite does not enforce it unless `PRAGMA foreign_keys` is on, so the
  grid treats the reference as a hint and the jump filters on the value as stored.
