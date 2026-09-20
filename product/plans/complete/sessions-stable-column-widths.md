# Stable sessions column widths

Issue: the heading and items in the rows in the session tab table are not aligned. they should all be left aligned. the table headings and row entries on the sessions tab should be aligned.

Complexity: 3/10

## Goal

Align each heading with the values below it regardless of the actions available on a row.

## Approach

Each row is an independent grid. Its final auto-sized track currently changes width with the number of action buttons, leaving the flexible columns with different space in every row and in the header. Reserve a fixed six-em action track for the largest three-button group, keep Type compact, and give Tab the larger flexible track. Explicitly left-align both headings and rows.

## Implementation steps

1. Correct the shared grid tracks and text alignment, then update the stylesheet regression tests to pin stable action width and left alignment. Run check-diff and the scoped CSS linter.
2. Update product/specs/sessions-tab.md, remove the completed entry, and promote the plan after validation.

## Tests

- Headings and rows use the same six tracks, with a fixed action width rather than content-dependent auto sizing.
- Both headings and rows explicitly align text left.
- Existing rendering and action tests cover rows with different button counts.

## Specs / docs

The sessions spec describes left-aligned columns that stay aligned when action counts differ. No public documentation or help text describes the table layout.

## Out of scope

Session behavior, row ordering, grouping, and PR description changes.
