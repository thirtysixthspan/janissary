# Fix: confirm the diff tab's removed-line treatment against its requirement

**Complexity: 1/10** — verification only. The requirement's substance was delivered by the marker work recorded in `product/plans/complete/diff-line-sign-markers.md`; this plan maps each remaining clause to the behavior that satisfies it and records the one clause that belongs to a later entry.

## Goal

A removed line reads as a change by its **−** sign and its darker red gutter with the row color as the secondary cue, rendered inline with the surrounding code in the unified layout and on the old side in the split layout — which is what the recorded requirement asks for.

## Approach

The requirement's clauses, each checked against the code rather than assumed:

1. **Pale red background** — `.diff-line.removed, .diff-cell.removed` in `web/src/plugins/diff/diff.css` mixes `--error` at 15%, the pale red the row already carries.
2. **A darker red accent in the gutter** — the `.diff-line.removed .diff-number` rule tints the number toward `--error`, delivered with the signs.
3. **A − indicator on each removed line** — the `.diff-marker` span renders `−` for a removed line in both layouts, and nothing for a context line or an empty side.
4. **Inline in unified mode, on the left in split mode** — `HunkLines` renders the row in the hunk's own order, and `SplitHunks` hands a removed line to the old, left, side.
5. **Readable syntax colors against the deletion background** — syntax highlighting is not part of this tab yet; it is the later `Syntax highlighting` entry, and no color the tab does render is changed by it.
6. **Selectable and commentable** — the tab holds no comments and never will: it is read-only, and `product/specs/diff-tab.md` says so. The rows are selectable text, and that is the whole of the review surface a read-only diff offers.

Nothing in the requirement is left to build except clause 5, which is a different entry.

## Implementation steps

1. Confirm each clause above against `web/src/plugins/diff/HunkLines.tsx`, `web/src/plugins/diff/SplitHunks.tsx`, and `web/src/plugins/diff/diff.css`.
2. Run `./scripts/run.mjs check-diff` and resolve any failures — the marker cases in `web/src/plugins/diff/DiffTab.test.tsx` pin the removed-line signs and the split side.
3. Record the resolution in this plan and promote it to `./product/plans/complete/`.
4. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

No new tests: every clause this entry can act on is pinned by the marker cases and the stylesheet rules the sign work added, which this plan confirms rather than re-implements.

## Out of scope

- Syntax highlighting, the later `Syntax highlighting` entry.
- The `+24 −8` counts on the file header, an entry of their own.
