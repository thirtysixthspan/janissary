# Fix: confirm the large-change presentation against its requirement

**Complexity: 1/10** — verification only. The requirement's substance is the oversized-entry work recorded in `product/plans/complete/diff-oversized-change-collapsed.md`; this plan maps each remaining clause to what that work delivers and to what the entry itself leaves optional.

## Goal

A change too large to read remains visible rather than flooding the tab: the entry opens collapsed, says how many lines it holds and what the cap is, and the same double-click that opens a whole-file entry loads every line.

## Approach

The requirement's clauses, each checked against the code:

1. **An explicit reduced-detail state** — `oversizedLines` in `web/src/plugins/diff/size-cap.ts` answers the count past `CHANGE_LINE_CAP`, and `FileEntry` collapses while the count is positive, exactly as it collapses a whole-file change.
2. **The user understands what is visible** — the collapsed header's `.diff-large-file` note names both the change's line count and the cap, so the reader knows the complete diff is *not* shown and how much is held back.
3. **A control that loads the rest** — the double-click on the header expands the entry to every line and collapses it again, one gesture for both collapse reasons.
4. **Stable scroll as content enters and leaves** — an expansion happens inside its own entry, above which nothing moves, so the body's scroll position holds; the hunk the keyboard walk is on is the one the shared selection scrolls into view, whichever state the entry is in.
5. **Virtualized rendering** — the entry says only that it *may* be virtualized. The tab's per-entry cap already bounds what one entry can mount, and no measurement has shown the list itself to be the problem, so nothing here chooses to build it.
6. **Search and print limitations under virtualization** — nothing to explain, because nothing is virtualized.

Nothing in the requirement is left to build except clause 5's optional virtualization, which the entry leaves to judgment and this plan declines.

## Implementation steps

1. Confirm each clause above against `size-cap.ts`, `FileEntry.tsx`, and `diff.css`.
2. Record the resolution in this plan and promote it to `./product/plans/complete/`.
3. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

No new tests: the collapsed oversized entry, its note, and the expanding double-click are already pinned in `web/src/plugins/diff/size-cap.test.ts` and the rendering cases in `web/src/plugins/diff/DiffTab.test.tsx`, which this plan confirms rather than re-implements.

## Out of scope

- Virtualized rendering, which the entry leaves optional and no measurement has asked for.
- Comment threads and the expansion of context between hunks, which the entry names only as things
  virtualization would disturb and which the later entries request in their own right.
