# Keep the pager's unfiltered row count right after a write

**Complexity: 3/10** — a cache that is never invalidated, plus the cases that pin when it is. No
change to what any figure means, and none to the statement the count is read from.

## Goal

The unfiltered row count an object is reported at is cached the first time the object is read and
reused for every later read of it. A write changes the row count and the cache does not, so the pager
reports the figure from before the write: `Rows 1–5 of 5 of 4 rows`, whose filtered total is larger
than the unfiltered total it is divided against, which is not a number any table can produce.

## Approach

`DatabaseBrowser` keeps `unfiltered` as a `Map` keyed `` `${database} ${object}` ``, seeded from every
read's `grid.unfilteredTotal` and consulted by `rememberedTotal` before it looks at whether the query
has filters. The entry is cleared in `dispose` and nowhere else, so it survives every write and every
**Refresh** — the two events that can change an object's size.

Invalidating on exactly those two events is the whole fix, and it is why the cache is safe to keep at
all: between them an object's size cannot change through this surface, because a change from anywhere
else is the case `product/specs/sql-database.md` already says leaves the view showing what it last
read until **Refresh**.

So `schema` — what **Refresh** and `sql <name>` both issue — clears the database's entries, and so does
every write answer: the three mutations, which reach `write`, and a console statement, which reaches
`run`. A console statement is cleared whole rather than by object because a statement may be
`DROP TABLE` or `ALTER TABLE` and the browser is not told what it touched.

The alternative, dropping the cache for a query with no filters, is not taken: it would fix this shape
of the bug while leaving a filtered grid's denominator stale after the same write, which is the
figure the design cares about most.

## Implementation steps

1. `src/database/browser.ts`: a private `forgetTotals(database)` that deletes every entry whose key
   starts with that database, called from `create`, `schema` and the write paths.
2. `src/database/manager.test.ts` or `src/database/browser.test.ts`: the cases below.

## Tests

- `src/database/browser.test.ts`: an object read with no filters, then written to, then re-read, is
  reported at its new size on both figures — the case that produces `5 of 4` today. The same after a
  console statement, which is cleared whole because it may have touched any object. And the case that
  keeps the cache's reason for existing: a first *filtered* query on an object still counts it without
  filters, so the denominator is the object's size and not the filtered count.

## What was checked and left alone

- `totals` in `src/database/grid.ts` is already correct for an unfiltered query, computing both figures
  from the one count. The bug is entirely in which figure is handed to it.
- The cap on `results` and the row-key store are untouched: neither is affected by a count going stale.
- A change made from another tab's `db` command still leaves the view as it last read it, which
  `product/specs/sql-database.md` states and this does not change — **Refresh** is what re-reads, and
  it is what now clears the count with everything else.
