# Only say a column has too many values when that is why

**Complexity: 2/10** — one condition in one component, one test case.

## Goal

`StatsPanel.tsx` renders its "too many distinct values to chart" line whenever a column has no bars.
A column holding nothing but nulls also has no bars, because `columnStats` in `src/database/stats.ts`
returns an empty value list when `COUNT(DISTINCT col)` is 0 — so the panel prints a distinct count of
`0` directly above a line telling the user that is too many.

`product/specs/sql-database.md` constrains that line to "a column with more distinct values than
that", which is what the code should be saying.

## Approach

Make the line conditional on the reason it exists, rather than on the absence of its alternative —
and have the server say what the threshold is, rather than have the client guess at a copy of it.

## Implementation steps

1. **`src/protocol/database.ts`** — `DatabaseColumnStatsView` gains `distinctLimit: number`. The
   threshold is the server's decision, and a client plugin may not import `src/database/stats.ts`, so
   the figure has to travel with the data rather than be re-declared beside it.
2. **`src/database/stats.ts`** — `columnStats` fills it from the `DISTINCT_LIMIT` the module already
   owns.
3. **`src/plugins/sql/shared.ts`** — `SqlStatsColumn` mirrors the field and `isStatsColumn` checks it,
   so a payload missing it is refused rather than rendering a panel that says nothing sensible.
4. **`web/src/plugins/sql/StatsPanel.tsx`** — render the too-many line only when
   `column.distinct > column.distinctLimit`, and the bars whenever there are any. A column with no
   distinct values at all then shows neither, and the two sides cannot disagree about what "too
   many" means.
5. **`web/src/plugins/sql/SqlDrawer.test.tsx`** — it carries a `StatsPanel` describe block the
   dedicated file now covers case for case. Delete that block and its import rather than leaving two
   suites asserting the same component, and keep every `SqlDrawer` case as it is.

## Tests

- **`web/src/plugins/sql/StatsPanel.test.tsx`** — a case for a column with `distinct: 0`, `nulls` above
  zero and no values, asserting the too-many line is absent and the null figure is still shown, and
  one asserting the threshold is read from the host's figure rather than a constant beside it. That
  file was added on this branch in the same round, so these are cases in a file that already exists.

`product/specs/sql-database.md` needs no change — the fix makes the code match what it already says.
