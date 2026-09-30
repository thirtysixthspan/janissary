# A console read that was cut off says so on the range line

Issue: Say that a console read was cut off instead of reporting it as a table of two hundred —
`takeRows` in `src/database/console-read.ts` knows the iterator had more rows and `consoleGrid` spends
that knowledge on a `total` of exactly the ceiling, so the grid has no way to say it, and `pageLabel`
reads `Rows 1–200 of 200 rows`.

Complexity: 3/10

## Goal

The flag the console read already computes reaches the range line. A grid whose page was cut off at
the console's ceiling reads as a cut-off rather than as a table of that size, and the flag travels
as one optional boolean on the grid view, which is the shape the wire type already uses for
everything a grid view may or may not carry.

## Approach

- `src/protocol/database.ts`: `DatabaseGridView` gains `truncated?: boolean`, documented as the
  console's own ceiling having cut the result short. Optional, so `runGrid`'s pages and `emptyGrid`'s
  failure stand unchanged and nothing else that builds a grid view has to say anything.
- `src/database/console-read.ts`: `consoleGrid` sets it from the `truncated` it already takes. The
  `total` it currently pads with the ceiling stays — a cut-off still reports the rows it holds, and
  the pager's **Next** must stay disabled because there is no second page of a console result.
- `src/plugins/sql/shared.ts`: `SqlGrid` gains the same optional field and `isGrid` accepts it, so a
  payload carrying the flag is a valid `SqlPayload` rather than one the guard turns into a plugin
  failure. The guard's job is presence and kind, so this is a kind check, not a value check.
- `web/src/plugins/sql/grid-view.ts`: `pageLabel` reads it before the total, and returns
  `First 200 rows of more than 200.` — never a total, because a total is exactly the claim the spec
  says a cut-off result must not make. Both the grid header and the pager render `pageLabel`, so
  both say it and neither keeps the old sentence.
- Nothing else moves. The grid's `No rows.` branch is unchanged, because a truncated result is never
  empty: it is by definition at the ceiling.

## Implementation steps

1. `src/protocol/database.ts`: add `truncated?: boolean` to `DatabaseGridView`.
2. `src/database/console-read.ts`: set it in `consoleGrid`.
3. `src/plugins/sql/shared.ts`: add the field to `SqlGrid` and accept it in `isGrid`.
4. `web/src/plugins/sql/grid-view.ts`: read it in `pageLabel`.
5. `./scripts/run.mjs check-diff`.

## Tests

- `src/database/browser.test.ts`: the existing console-limit test gains an assertion that the grid
  carrying `CONSOLE_ROW_LIMIT` rows reports `truncated: true`, and the read that fits asserts
  `truncated` is falsy — the two halves, since a flag always set would say the same thing about
  every result.
- `src/plugins/sql/shared.test.ts`: a grid payload carrying `truncated: true` passes `isSqlPayload`,
  which is the guard the client runs and the one that would otherwise report a plugin failure.
- `web/src/plugins/sql/grid-view.test.ts`:
  - a grid flagged truncated reads `First 200 rows of more than 200.`
  - the same grid unflagged still reads `Rows 1–200 of 200 rows`, so the flag is what changes the
    sentence rather than the shape of the page.

## Out of scope

- The console's own line under the prompt and the notifications feed. The spec asks the *range line*
  to say so, and the console already reports a result differently from a failure.
- **Next** on a truncated grid. It is already disabled and should stay: a console result is one
  iterator taken once, and there is no second page to ask for.
- Export, which streams the whole filtered query and is bounded by its own row ceiling.

## Specs / docs

`product/specs/sql-database.md` — no change: "A result longer than that is cut off there and the
range line says so rather than reporting a table of two hundred" already states this. No `help.md` or
`documentation/user-documentation/` page reports the range line, so no documentation change.
