# Bound what a console statement materialises

**Complexity: 3/10** — one loop, one new field on the grid, and a sentence in the spec.

## Goal

`DatabaseBrowser.run` prepares a statement the user typed and, when it is a read, calls `.all()` on
it. `.all()` materialises every matching row. The two-hundred-row ceiling is applied afterwards, by
`consoleGrid` slicing the array it was handed — so `SELECT * FROM large` in the console holds the
whole table in the server's memory and blocks the event loop doing it.

`src/database/export.ts` names this exact hazard in its own comment as the reason export streams
through `StatementSync.iterate()`, and `CONSOLE_ROW_LIMIT` exists to be a bound on what crosses
into the server. Right now it is a bound on what reaches the screen, one step too late.

## Approach

Iterate instead of materialising, and stop at the ceiling. Report whether the iterator had more, so
the grid's total says the ceiling rather than claiming a table of two hundred.

## Implementation steps

1. **`src/database/browser.ts`** — in `run`'s read branch, replace `.all()` with `.iterate()`, pull
   rows out one at a time, and break as soon as `CONSOLE_ROW_LIMIT` have been taken. `consoleGrid`
   takes the rows it was given plus a `truncated` flag rather than deriving a total from the array's
   length, and the recorded result carries `total: CONSOLE_ROW_LIMIT` when the iterator had more.
2. Update the comment on `CONSOLE_ROW_LIMIT`, which currently says how many rows a statement "may
   fill the grid with" — which is true, but says nothing about the bound being what crosses the wire.

The read still runs to completion inside SQLite; what changes is how many rows are held in the
server at once, which is the part this application can control.

## Tests

- `src/database/browser.test.ts` — add a case that seeds a table with more than `CONSOLE_ROW_LIMIT`
  rows, runs a read over all of them, and asserts the recorded result carries exactly
  `CONSOLE_ROW_LIMIT` rows and the truncated total. The file's `seeded` helper takes a SQL string,
  so a table of a few hundred rows is a one-line addition.
- Every existing console case keeps passing unchanged.

## Spec

`product/specs/sql-database.md` says a statement that returns rows "fills the grid" without saying
how much of it. Add a sentence to The console: the grid shows the first two hundred rows of a read,
and a result longer than that says so rather than pretending the table is that size.
