# Drop a sort order that names a column the next object does not have

**Complexity: 3/10** — two small guards in existing pure functions, four test cases, one sentence in
the spec.

## Goal

A column header toggles the order, and the order is the tab payload's: it survives every later
action, including selecting another object. `selected` drops the filters and the hidden columns
naming columns the newly selected object does not have, and leaves the order alone. So ordering
`orders` by `total` and then selecting `alphabet` issues
`SELECT "at", "k" FROM "alphabet" ORDER BY "total" ASC`, which SQLite refuses with
`no such column: "total"`.

`fold` keeps the page a failed read was replacing, so the tab does not empty — it shows the previous
object's rows and headers under the new object's name, with the failure in the error band. A cell
edited in that state is written to the table the previous object named, because the row key the
client sends is that table's.

`product/specs/sql-database.md` states the rule for filters — "A filter belongs to a column of one
object, so selecting a different object drops the filters naming columns it does not have — keeping
them would build a statement naming a column that is not there" — and the same sentence is true of
the order, which the drawer's promise rests on: "The order shown is the order actually used,
including the primary-key fallback, so a read-only table's `ORDER BY` is never a surprise."

## Approach

Two guards, because two things have to agree. The plugin drops the order entries the new object
cannot satisfy, so the payload and the header's sort marker describe the query that will run. The
server's `resolveOrder` ignores any requested column the object does not declare and falls back to
the primary key, so a statement is never built from a column that is not there whatever a client
sends — the rule the server already applies to `WHERE` through the columns it reads itself.

Dropping only in the plugin would leave a client that names a column of its own choosing the order;
dropping only on the server would leave the header showing a sort the grid is not using.

## Implementation steps

1. **`src/plugins/sql/payload-changes.ts`** — in `selected`, filter `payload.order` through the same
   `present` predicate the filters and hidden columns use, so an order naming a column the new
   object lacks is dropped with them. An object the tab has never listed keeps everything, which is
   what `present` already answers for the other two.
2. **`src/database/grid-sql.ts`** — in `resolveOrder`, keep only the requested entries whose column
   the object declares, and fall back to the key or the first column when none survive. The
   fallback is the one already there for no order at all, so a read-only table's `ORDER BY` is the
   one its own key would give.

## Tests

- `src/database/grid.test.ts` — beside the three `resolveOrder` cases: a requested column the object
  does not declare falls back to the primary key; a request naming one real column and one absent
  one keeps the real one; an object with neither a key nor the requested column still falls back to
  its first column.
- `src/plugins/sql/activate.test.ts` — beside the two filter cases on `select-object`: an order
  naming a column the newly selected object does not have is dropped from the query, and an order
  the new object does have is kept. A case for an object the tab has never listed keeps its order,
  matching what the filter rule already does.

`product/specs/sql-database.md` gains one clause beside the filter rule: the order is a fact about a
column of one object too, so selecting a different object drops an order naming a column it does
not have, and the grid orders the new object by its own key.
