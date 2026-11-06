# SQL highlight resets on every state broadcast

Bug: the keyboard focus in the sql tab keeps returning to the first row making it impossible to move the focus with the keyboard or the mouse.

Complexity rating: 2/10

## Root cause

`useGridSelection` in `web/src/plugins/sql/selection.tsx` resets the highlighted run to the first row in an effect keyed on `[grid, rows]`, where `grid` is `payload.grid` by reference. The intent is "a new page or a new query starts on the first row", but object identity is not page identity.

The server broadcasts a full state snapshot (`tabs: controller.view()`) whenever any tab changes: focus, busy state, transcript output, pty activity, and so on. The web client parses each message with `JSON.parse` and stores the result without structural sharing, so every broadcast hands the SQL tab a new `payload.grid` object with the same content. Each one re-runs the reset effect. The highlight snaps back to row 0, and the reveal effect scrolls the frame to the top. With any other tab active, this happens constantly, so the highlight cannot be moved with the arrow keys or with a click.

## Correct behavior

`product/specs/sql-database.md` (Editing) says the highlight starts on the first row of whatever page arrives and is back on the first row after a new query, so it never sits on a row that now holds other values. The highlight therefore resets only when the page's content changes: a new query, another page, or rows whose values changed. The same page delivered again as a new object leaves the highlight and the scroll position where they were.

## Reproduction

Added to `web/src/plugins/sql/Selection.test.tsx`: render the grid, press `ArrowDown` (or press the second row's header), then rerender with `structuredClone(payload())`, the same page as a new object the way a broadcast delivers it. Against the unfixed code, the highlight reads `[['1', 'paid']]` instead of `[['2', 'NULL']]`. Both tests fail with `AssertionError: expected [ [ '1', 'paid' ] ] to deeply equal [ [ '2', 'NULL' ] ]`.

## Approach

Key the reset on the page's content instead of its reference. In `useGridSelection`, derive a content signature of the grid (`JSON.stringify(grid)`, memoized on `grid` so it is computed once per delivery) and use it as the reset effect's dependency in place of `grid`. A page whose content changed (another query, another page, edited or re-read values) still resets to the first row. An identical page does not.

## Implementation steps

1. In `web/src/plugins/sql/selection.tsx`, compute `const page = useMemo(() => JSON.stringify(grid), [grid]);` and change the reset effect's dependencies from `[grid, rows]` to `[page, rows]`. Update the comment above the effect to say why the content, not the object, is the key.

## Regression test

`web/src/plugins/sql/Selection.test.tsx`, in `the highlighted row`:

- `stays where the keys left it when the same page arrives again as a new object`: `ArrowDown`, set the frame's `scrollTop`, rerender with a cloned payload, and expect the second row to stay highlighted and the scroll position to stay put.
- `stays on the row a press highlighted when the same page arrives again`: the same for a mouse press on a row header.
- `is the first row again when a re-read brings back other values`: guards the spec's other half, so the highlight still resets when the rows' values change.

The existing `is the first row again after a new query` test keeps covering the reset for a new page. It used to change only `payload.offset` and leave `payload.grid` identical, which passed only because of the reference reset. It now builds the next page's grid with the new `offset` and `parameters`, the way a real page change arrives.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes, including the new tests.
- Live end to end: start a scratch instance, create a SQLite database with a table of several rows, and open it with `sql`. Focus the rows, press `ArrowDown` twice, then cause unrelated state broadcasts (for example, run a command in another tab or switch tabs and back). Expect the third row to stay highlighted. Then click the fifth row, trigger broadcasts again, and expect the fifth row to stay highlighted.
- Result: the driver created `shop.items` with 30 rows, opened `sql shop`, and switched to the `janus` tab and back. A second client counted the state broadcasts (2 per switch). On an unfixed build, the highlight went from row index 2 back to 0 after the arrow keys, and from 5 back to 0 after a click. On the fixed build it stayed on 2 and on 5, and `ArrowDown` after the click moved to 6. **Refresh** still returns to the first row, because it re-runs the query and mints new row keys, which the spec counts as a new query.

## Out of scope

- `useColumnFit` also re-runs on every broadcast because it is keyed on `grid` by reference. Refitting is idempotent and does not move the highlight or the focus, so it is left alone.
- Reference-preserving merges of state broadcasts on the client, which would fix this class of problem for every plugin but is a much wider change.
- Whether a cell edit should keep the highlight on the edited row. A re-read with changed values resets it, as the spec says today.

## Specs and docs

- `product/specs/sql-database.md`: state that the same page arriving again leaves the highlight where it was.
- `help/` and `documentation/user-documentation/`: checked. Neither documents when the highlight resets, so neither changes.
