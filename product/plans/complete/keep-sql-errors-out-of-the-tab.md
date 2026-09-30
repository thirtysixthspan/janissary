# Keep SQL errors out of the sql tab

**Complexity: 2/10** — drop the grid's error band, let the header say the one thing the tab cannot otherwise show, and correct the spec.

## Goal

A statement or read that fails is already reported as a notification, attributed to the tab it ran in. The tab says it a second time in an error band above the table, which pushes the grid down, stays there until the next successful answer, and repeats what the feed already carries. SQL errors should not be displayed in the sql tab at all.

## Approach

Remove the band that renders `payload.error`. The payload keeps its `error` field: the server still compares a new failure against the one before it so a refresh that fails the same way twice is said once, and that comparison is the field's only remaining job.

Two things depended on the band and need a replacement:

- **A deleted database.** A database removed by `db sqlite delete` drops the grid, and with no grid and no band the header would read `Loading…` for good. When there is no grid, nothing outstanding, and an error recorded, the grid header's count reads that error instead. That is the missing-database message in practice, because a failed read otherwise keeps the grid it had. It is the tab's state rather than a report of a statement, and it is the one thing the tab would otherwise misstate.
- **An empty page after a failure.** The `No rows.` row was hidden while an error was showing, so the band stood in for it. With the band gone a page with no rows says `No rows.` whether or not the last request failed, since the grid is still the last page that was read.

The clipboard fallback band is not a SQL error and is unchanged: it carries text the user asked to copy.

## Implementation steps

1. **`web/src/plugins/sql/DataGrid.tsx`** — delete the `payload.error` band, and drop `!payload.error` from the empty-row condition.
2. **`web/src/plugins/sql/grid-view.ts`** — `countLabel` returns the recorded error when there is no grid and nothing is pending.
3. **`src/plugins/sql/intents.ts`** — the `requireWritable` comment says the host's refusal arrives as a notification, not an error band.

## Tests

- `web/src/plugins/sql/DataGrid.test.tsx` — the "error band" case is replaced: a failed read shows no alert and keeps the grid; an empty page still says `No rows.` after a failure; a tab whose database was deleted says so in its header.
- `web/src/plugins/sql/grid-view.test.ts` — `countLabel` reads the error with no grid and nothing pending, and `Loading…` while a request is outstanding even with an error recorded.

## Spec

`product/specs/sql-database.md` — What the tab shows loses the error band; the console section says a failure is a notification only; the deleted-database paragraphs say the grid header carries the message; the clipboard fallback keeps its band.

## Out of scope

- Changing how failures are notified, or their dedup.
- The clipboard fallback band.
