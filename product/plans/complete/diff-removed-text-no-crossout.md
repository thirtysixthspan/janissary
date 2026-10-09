# Remove crossout from deleted diff text

Complexity: 1/10.

## Goal

Display removed diff text without strike-through in unified and split layouts while retaining all other deletion cues and behavior.

## Approach

Remove the diff stylesheet's removed-text decoration rule. Preserve the deletion background, colored gutters, minus markers, syntax highlighting, intraline marks, and inert removed-line targeting. Update the existing stylesheet and renderer comments that describe strike-through, as they would otherwise become inaccurate.

## Implementation steps

1. Remove the strike-through rule from `web/src/plugins/diff/diff.css` and correct its header comment and the comment in `ChangedText.tsx`. Update the old strike-through assertion in `split-styles.test.tsx`, and add parameterized rendered-row regression tests proving removed text and nested syntax/character-mark spans have no crossout in both layouts. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/diff-tab.md` to state that removed text remains readable without crossout. Check help and existing user documentation, retaining the separate editor suggestion-preview behavior. Promote this plan and remove only the selected backlog entry. Run `./scripts/run.mjs check-diff`.
3. Revalidate PR #1621 and `feature/diff-tab`, commit through `pr-commit`, push, and confirm the open PR's head matches the local commit.

## Tests

Verify removed text, syntax tokens, and nested character marks have no strike-through in unified and split layouts. Retain existing tests for deletion backgrounds, gutter colors, minus markers, changed-character tint, preserved source text, selection, and inert removed lines.

## Out of scope

Editor suggestion previews, other deletion styling, context expansion, inline comments, PR title/description changes, and merging the PR.
