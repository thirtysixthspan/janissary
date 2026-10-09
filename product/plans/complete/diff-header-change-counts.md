# Fix: confirm the file header's change counts against their requirement

**Complexity: 1/10** — verification only. Every clause the requirement makes mandatory is already in the tab; this plan maps them and records the decision on the one optional decoration.

## Goal

Each file entry's header shows how many lines the change adds and how many it removes — `+24 −8`,
green and red — in a position a reader can scan down a column of headers by, counting the lines the
change actually touched rather than the rows the tab happens to render.

## Approach

The requirement's clauses, each checked against the code:

1. **A compact summary in the header** — `.diff-counts` in `FileEntry` renders `+N` beside `−M` in the
   header's trailing edge, hidden when a count is zero so an untracked file reads as `+N` alone.
2. **Green for additions, red for deletions** — the two spans carry `--success` and `--error`, the same
   colors the rows carry, so the header and the rows agree.
3. **Counts that reflect the actual lines** — the payload's `additions` and `deletions` are counted from
   the hunk lines in `src/plugins/diff/parse-diff.ts`, not from the rows the client renders, so a
   collapsed entry's counts, a wrapped line's rows, and an intra-line split all leave them alone.
4. **A consistently aligned position** — `.diff-counts` is pushed to the header's trailing edge by
   `margin-left: auto` with `flex-shrink: 0`, so the group scans by eye down a column of headers.
5. **A proportional bar** — the requirement leaves it optional and asks that the numeric counts stay
   either way. The header's row already carries the status word and, for a collapsed entry, the reason
   note; a bar beside the counts would compete with both for the same narrow row, and the numbers lose
   nothing without it. Declined here.

Nothing in the requirement is left to build.

## Implementation steps

1. Confirm each clause above against `web/src/plugins/diff/FileEntry.tsx`, `web/src/plugins/diff/diff.css`, and `src/plugins/diff/parse-diff.ts`.
2. Record the resolution in this plan and promote it to `./product/plans/complete/`.
3. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

No new tests: the `+N` and `−M` rendering and the zero-count hiding are already pinned by
`web/src/plugins/diff/DiffTab.test.tsx`, and the parser's counting by its own tests, which this plan
confirms rather than re-implements.

## Out of scope

- The proportional bar, declined above.
- The status word beside the counts, which arrived with the change-status entry.
