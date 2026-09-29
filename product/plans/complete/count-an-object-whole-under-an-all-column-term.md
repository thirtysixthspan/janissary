# Count an object whole when its first query carries an all-column term

**Complexity: 2/10** — one condition in one private method, one test case, one clause in the spec.

## Goal

`rememberedTotal` decides a query is unfiltered by `query.filters.length === 0` alone, so a query
narrowed only by the all-column search term takes the "no filters" path and its filtered count is
cached as the object's size. That count is what the pager's second figure reports for the rest of
the session, so a table of six rows reads `Rows 1–6 of 6 of 1 rows` — a filtered total larger than the
table it claims.

The per-column case is already handled, and the plan that added it says why: "A filtered query whose
object has never been counted cannot seed the cache from its own count: that number is the filtered
one, and it would go on being reported as the object's size." The all-column term, added later on the
same branch, narrows the query in exactly the same way and is not part of the test that condition
was written for.

`product/specs/sql-database.md` promises the figure is "right even when the first query for an
object arrives already filtered, as following a key into an unvisited table does" — the term
arrives already filtered the same way.

## Approach

Ask the same question the filter case asks: is anything narrowing this query? The term counts, so a
first query carrying one pays for the unfiltered `COUNT(*)` the per-column case already pays for.
Once cached, the term is irrelevant, which is what the cache is for.

## Implementation steps

1. **`src/database/browser.ts`** — in `rememberedTotal`, treat a non-empty `query.global` as narrowing
   alongside `query.filters`, and say in the method's comment that the term narrows the same way the
   filters do, so it is answered the same way.

## Tests

- `src/database/browser.test.ts` — beside "counts an object whole the first time a filtered query asks
  about it": a first query carrying only the all-column term still reports the object's whole count,
  and the count stays whole for the next query once the term is gone.
