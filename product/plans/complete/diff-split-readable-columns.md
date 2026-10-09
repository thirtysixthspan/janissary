# Keep split diff columns readable

Complexity: 4/10.

## Goal

Complete the split diff view requirement: original and modified code remain horizontally aligned, visibly distinguish removals and additions, and retain readable column widths in narrow panes through horizontal scrolling.

## Approach

Keep the existing paired-row rendering, line gutters, markers, syntax highlighting, and single vertical body scroll. Give each split hunk a shared horizontal scroll area with a minimum row width of 96 monospace characters, divided equally between the old and new columns. Long text continues wrapping inside its column. Correct the shared change-color selectors and split divider/placeholder selectors to match the prefixed classes emitted by the renderers; this also restores those shared colors in unified layout.

## Implementation steps

1. Update `web/src/plugins/diff/diff.css` for split horizontal scrolling and equal column sizing, and correct mismatched row, marker, intraline, divider, and placeholder selectors. Update the existing stylesheet header comment to distinguish unified wrapping from split scrolling. Repair the existing selector assertions and add regression tests covering real rendered cells, narrow-pane sizing rules, change colors, removed-line strike-through, divider placement, and shaded empty placeholders. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/diff-tab.md` to describe readable minimum split widths, shared horizontal scrolling, wrapping, and alignment. Check `help.md` and existing user documentation; update only descriptions affected by this change. Promote the plan and remove only the selected Split diff view entry from the PR backlog. Run `./scripts/run.mjs check-diff`.
3. Revalidate PR #1621 and `feature/diff-tab`, commit through `pr-commit`, push to that branch, and confirm the PR remains open with the published commit at its head.

## Tests

Retain the existing row-pairing, original/new line number, syntax highlighting, selection, and line-targeting coverage. Verify all split rows share one horizontal scroll container, retain a 96ch minimum width, and allocate equal columns with matching row heights. Assert that CSS selectors match rendered addition/removal rows, number gutters, markers, and character marks while preserving token colors; removed text is struck through, the old side has a divider, and an empty placeholder is shaded with no line number or marker. Verify unified hunks retain their existing wrapping behavior without the split minimum width.

## Out of scope

Inline comments, context or full-file expansion, additional language metadata or grammars, unified replacement ordering, new documentation pages, keyboard navigation changes, PR title/description changes, and merging the PR.
