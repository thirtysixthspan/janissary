# Fix: confirm the split layout's empty alignment rows against their requirement

**Complexity: 1/10** — verification only. The requirement's substance is in the tab from its first commit; this plan maps each clause to the code that satisfies it, and adds the one test the suite was missing.

## Goal

Where a split row's two sides have no lines to pair — a run of removals longer than the run that
replaced it, or the other way around — the side with nothing to show still occupies its half of the
row, so the two columns stay aligned, without claiming a number or a line of its own.

## Approach

The requirement's clauses, each checked against the code:

1. **An empty row exists where the pairing has nothing on one side** — `splitRows` in
   `web/src/plugins/diff/split-rows.ts` pads the shorter of a removed run and the run that replaced it,
   so the longer run's rows carry an absent side.
2. **A neutral, subtly shaded background** — `.diff-split-row .diff-cell.empty` in
   `web/src/plugins/diff/diff.css` mixes `--muted` at 5%, the faintest tint in the tab.
3. **The same height as a code row** — the empty side renders the same `.diff-cell` padding and a
   `.diff-text` holding one space, so its height is a row's height; and a `.diff-split-row` is a flex
   row with no `align-items` of its own, so a side whose written content wraps to several rows carries
   the empty one to the same height instead of leaving it short.
4. **No fake line numbers and nothing of its own** — the empty side's `.diff-number` and `.diff-marker`
   spans are empty, it opens nothing on a click, and it is not part of any count: `additions` and
   `deletions` come from the payload's lines, which never hold a row the file did not print.

Nothing in the requirement is left to build. The one thing the suite did not pin was the alignment
itself, which the new case below now does.

## Implementation steps

1. Confirm each clause above against `split-rows.ts`, `SplitHunks.tsx`, and `diff.css`.
2. Add the case below to `web/src/plugins/diff/DiffTab.test.tsx`.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Record the resolution in this plan and promote it to `./product/plans/complete/`.
5. Remove the resolved entry from `./product/backlog/pull-request.md`, leaving every other entry byte-for-byte unchanged.

## Tests

- A split row whose side has nothing to show renders an empty cell holding no number and no sign, beside the side that does.

## Out of scope

- The menu, status, or review controls a review interface's header carries, which other entries track.
