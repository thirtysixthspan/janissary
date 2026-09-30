# An empty database reads `No tables.` rather than `Loading…`

Issue: Show `No tables.` in a database that has none instead of leaving the tab on `Loading…` —
opening a tab on a database with no objects settles the grid to `null`, and the grid header renders
`grid ? pageLabel(grid) : 'Loading…'`, so the only sentence that could say the database is empty is
the one standing in for a read in flight.

Complexity: 2/10

## Goal

A grid header that tells an outstanding read and an empty database apart. `Loading…` while a request
is actually pending, `No tables.` once the schema read has landed with nothing in it — the two states
the payload already holds apart, and the second one every other empty state in the application
already reports.

## Approach

- `web/src/plugins/sql/grid-view.ts`: a pure `countLabel(payload)` alongside `pageLabel`, which
  returns `pageLabel(grid)` when a page is there, `Loading…` when `payload.pending` is a request the
  tab is waiting on, `No tables.` when nothing is pending and `payload.objects` is empty, and
  `Loading…` for the remaining case. It lives in the pure module rather than inline in the component
  so it is testable without a render, per `ai/guidelines/react-code-organization.md`.
- `web/src/plugins/sql/DataGrid.tsx`: `sql-grid-count` renders `countLabel(payload)` in place of the
  inline ternary. Nothing else in the component reads `grid` being null, and `grid` keeps its
  narrower type, so no other line moves.
- No server change. `foldSchema` in `src/plugins/sql/fold.ts` already settles an object list of zero
  as `{ objects: [], object: '', grid: null }` with `pending` cleared, which is precisely the state
  the new branch reads — the answer was already being recorded correctly and nothing could display it.

## Implementation steps

1. `web/src/plugins/sql/grid-view.ts`: add `countLabel`.
2. `web/src/plugins/sql/DataGrid.tsx`: render it in the grid header.
3. `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/sql/grid-view.test.ts` (`countLabel`):
  - a payload holding a page reads exactly what `pageLabel` reads for that page.
  - a payload with a pending request and no grid reads `Loading…`.
  - a payload with no pending request, no grid, and an empty object list reads `No tables.`.
  - a payload with objects but no page and nothing pending — a query refused on a tab that had read
    nothing — still reads `Loading…`, so the new branch cannot swallow that case.
  - a tab that has just opened, with an empty object list *and* a request pending, reads `Loading…`
    rather than `No tables.`, which is the case the ordering of the two branches decides.
- `web/src/plugins/sql/DataGrid.test.tsx`: the rendered grid header reads `No tables.` for an empty
  database, and `Loading…` once a request is pending.

## Out of scope

- The object's own line, which reads `—` for a database with no objects. There is no object to name,
  and the backlog entry's expected result names only the header's count.
- The pager, which renders nothing at all for a null grid. It shows a *range*, and there is no range
  in either case; only the header carries the "nothing here yet" distinction.
- `foldSchema` and the rest of the server fold, which already record the empty answer correctly.

## Specs / docs

`product/specs/sql-database.md` — no change: "While a read is still outstanding the grid header reads
`Loading…`, and once the answer lands `No tables.` means the database is empty rather than that
nothing has been read yet" already states this, and this fix makes the code say it. No `help.md` or
`documentation/user-documentation/` page describes the grid's header, so no documentation change.
