# Fix: introduce each of the diff tab's hunks with its range header

**Complexity: 3/10** — one small pure module, a header row in both layouts' hunk component, two stylesheet rules, and the rendering tests. No wire, server, or parser change: the hunk record already carries both sides' start lines.

## Goal

Each hunk is a block of its own, introduced by the `@@ -start,length +start,length @@` range git used, so a reader can see where the change begins and ends on each side, that lines were skipped between hunks rather than deleted, and where more than one hunk shares a file they are visibly separate blocks.

## Approach

The payload's hunk carries `oldStart` and `newStart` and every line's kind, so the range a hunk's header names is computed from the record the tab already holds — git's own counts are the lines each side of the hunk holds: the original side holds a hunk's context and removed lines, the new side its context and added ones.

1. **The range.** `web/src/plugins/diff/hunk-range.ts` renders the range the way git prints it, counting the two sides' lines from the hunk's own record.
2. **The block.** `HunkLines` and `SplitHunks` open each hunk with a `.diff-hunk-header` row carrying that range, and `diff.css` gives the row the muted quiet text the header of a section deserves, plus spacing above every hunk after the first so consecutive blocks are separate rather than one run of rows.

## Implementation steps

1. Add `web/src/plugins/diff/hunk-range.ts` with the range formatting.
2. Add `web/src/plugins/diff/hunk-range.test.ts` with the cases below.
3. Render the header row in `web/src/plugins/diff/HunkLines.tsx` and `web/src/plugins/diff/SplitHunks.tsx`.
4. Add the `.diff-hunk-header` and inter-hunk spacing rules to `web/src/plugins/diff/diff.css`.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Extend `web/src/plugins/diff/DiffTab.test.tsx` with the rendering case below.
7. Run `./scripts/run.mjs check-diff` and resolve any failures.
8. Update `product/specs/diff-tab.md` to say each hunk carries its range header.
9. Check `help.md` and `documentation/user-documentation/` for a hunk claim, and update it only if present.

## Tests

- The range names both sides' start line and length, counting the lines each side of the hunk holds.
- A hunk that only removes answers the new side's length as 0, the way a pure deletion prints it.
- Each hunk of a file renders its own range header, in both the unified and the split layout, and hunks after the first hold space above them.

## Out of scope

- Collapsing a hunk or expanding the context around it, which the later entries request.
- The `@@` line's section heading, which git appends after the ranges and git only prints for the function the hunk sits in.
- The file header, which continues to appear once per file rather than once per hunk.
