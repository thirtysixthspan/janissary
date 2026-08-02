# Shared relative-path helpers

Complexity: 6/10

## Goal

Give the web file navigator one implementation of relative-path `basename` and `dirname` behavior, replacing the repeated inline slash handling without changing user-visible path matching or display behavior.

## Approach

Add a small `web/src/rel-path.ts` module with the two pure helpers and route every source call site that currently derives a tree-relative basename or parent directory through it. Preserve the existing empty-string behavior for paths without a slash.

## Implementation steps

1. Add and test `basename` and `dirname` in `web/src/rel-path.ts`.
2. Replace the duplicated basename and dirname calculations in the file navigator, fuzzy search, quick-open, and paste/rename helpers.
3. Run the diff checks and confirm the web behavior remains unchanged.
4. Promote this plan to `product/plans/complete/` and remove the resolved backlog entry.

## Tests

Add focused helper tests covering names with parents, names without parents, and parent paths at the root; retain the existing file navigator, fuzzy-match, quick-open, and rename test suites as regression coverage.

## Out of scope

Do not alter path normalization, absolute filesystem-path handling, command completion, or unrelated test fixtures that use `split('/').pop()` only to construct test data.
