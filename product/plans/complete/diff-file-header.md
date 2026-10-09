# Fix: confirm the diff tab's file header against its requirement

**Complexity: 1/10** — verification only. Every clause the tab can answer is already in it; the plan maps them and records the two clauses that belong elsewhere.

## Goal

Each changed file's name, its add and delete counts, and nothing else sit on one visually separate row
above the file's rows, and that row stays put when the entry is collapsed, because it is the way back
in.

## Approach

The requirement's clauses, each checked against the code:

1. **A distinct header above each changed file** — `FileEntry` opens every entry with `.diff-file-header`,
   which carries the tinted background and the rule that separates it from the entry below.
2. **The file path, truncated intelligently** — the `.diff-file-name` button names the path, `old → new`
   for a rename, and breaks a long one rather than pushing the counts off the row.
3. **Addition and deletion counts** — the `.diff-counts` group renders `+N` and `−M`, hidden when a count
   is zero, aligned to the trailing edge so a column of headers scans by eye.
4. **One horizontal row where space permits** — the header is a flex row with the counts pushed to the
   trailing edge by `margin-left: auto`.
5. **The header stays visible when the file is collapsed** — collapsing hides only the hunks, so the
   header with the whole-file or oversized note is the row the double-click reopens from.
6. **A change-status indicator** — not present today; the `File change status` entry owns it and is
   worked in its own right.
7. **A review-state control and a menu of file-specific actions** — not applicable: the tab is read-only,
   `product/specs/diff-tab.md` records that nothing in it stages, discards, or commits, and there is no
   review state for a change set that is never marked. The header's one action is the file's own name,
   which opens the file.

Nothing in the requirement is left to build except the status indicator, which the next entry records.

## Implementation steps

1. Confirm each clause above against `web/src/plugins/diff/FileEntry.tsx` and `web/src/plugins/diff/diff.css`.
2. Record the resolution in this plan and promote it to `./product/plans/complete/`.
3. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

No new tests: the header's contents, the counts, the rename's arrow form, and the header's staying put
across a collapse are already pinned in `web/src/plugins/diff/DiffTab.test.tsx`, which this plan confirms
rather than re-implements.

## Out of scope

- The change-status indicator, which is the next entry's own work.
- The file name's opening the file, which the spec already records.
