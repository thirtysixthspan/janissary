# Search every column at once

**Complexity: 3/10** — one more field on the query, one group in the `WHERE`, one control. The
design question is only whether the term is a filter like any other, and the answer is no: it names
no column, which is what makes it survive a switch of object.

## Goal

Filtering exists only per column, so finding a row means guessing which column the value is in. A
user who does not know a database's shape cannot find a value they can see on screen, which is the
common first visit to a database nobody has documented.

DB Browser for SQLite filters at two levels and names the second one a global filter over every
column. That is the shape to copy.

## Approach

One term, matched against the whole row.

The group is one `COALESCE(CAST("col" AS TEXT), '') LIKE ?` per column, joined with `OR`. The cast is
what makes a number, a blob and a string searchable by the same term; the coalesce is what keeps a
null column from hiding the row, since `NULL LIKE '%x%'` is not true. The value is bound once per
column because SQLite has no array parameter and a placeholder is a placeholder.

The group is parenthesized and placed before the per-column `AND` chain, so a row must match the
term *and* every per-column filter. Folding it into the chain instead would read as "matches the term
somewhere, or matches the first filter".

## Implementation steps

1. **`src/protocol/database.ts`** — add `global: string` to `DatabaseGridQuery`.
2. **`src/database/grid-sql.ts`** — emit the group. `whereClause` now takes the whole query and the
   object's columns, since the group is per column and the per-column clauses are not.
   `countStatement` takes the columns too, and *required* rather than defaulted: a count built without
   them would quietly drop the term and disagree with the page it is counting.
3. **`src/database/grid.ts`** — thread the columns through `totals`.
4. **`src/plugins/sql/shared.ts`** — `global` on `SqlPayload` and in its guard.
5. **`src/plugins/sql/tabs.ts`** — carry it in `gridQueryOf`, so the grid query and the export both
   get it, the export having run the same query already.
6. **`src/plugins/sql/shared-intents.ts`** — `SetGlobalFilterIntent`, accepting any string. An empty
   one removes the term, so clearing needs no second intent.
7. **`src/plugins/sql/intents.ts`** — the handler, plus `clear-filters` taking the term with them.
8. **`web/src/plugins/sql/Filters.tsx`** — the field, above the chips: it is the other order of
   narrowing, a per-column filter asked when the column is known and this when it is not.

## Tests

`src/database/grid.test.ts` covers the group, its bindings, the term combined with a per-column
filter, an object with no columns, a term that is SQL, and a count that agrees with the page it
counts. `src/plugins/sql/activate.test.ts` covers the intent, `clear-filters`, and the term
surviving an object switch. `web/src/plugins/sql/DataGrid.test.tsx` covers submitting, clearing, the
chip naming the term, and a resubmission asking for nothing.

## Out of scope

- The statistics panel. Those counts are the object's, and the term does not reach them.
- Turning the term into an editable filter once it has narrowed to one row. That is a different
  control with its own question — which column did it match, and was that the column meant.
- Folding the term into each column's own filter row as another operator. A term is not a column, so
  it has no header to sit under.
