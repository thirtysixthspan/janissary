# Verify sessions-table keyboard/mouse navigation with hover and caret highlighting

## Complexity

2/10 — a verification-and-cleanup entry against code that already implements it in full.

## Goal

Close the pull-request backlog entry "sessions table should be keyboard and mouse navigatable with a mouse hover highlight row and a keyboard caret highlight row." The sessions table already provides every part of this; the entry dates from before the current SessionList was on the branch and no code change is required.

## Verification of what the entry asks for

- Mouse hover highlight — `sessions.css` gives `.session-row:hover` a background distinct from the caret row's.
- Keyboard caret highlight — `.session-row.selected` marks the caret row; the list opens with row 0 selected and focused.
- Keyboard navigation — ArrowUp/ArrowDown move the caret without wrapping, Home/End jump to the ends, Enter opens (`nextSessionSelection`, `SessionList.onKeyDown`), with scroll-into-view tracking.
- Mouse navigation — a click moves the caret to the row; a second click on the already-current row opens it (`sessionClickSelection`), matching the double-gesture rule the fourth backlog entry records.

## Tests

All existing behaviors are covered by `web/src/plugins/sessions/SessionList.test.tsx` ("moves the current row with the arrow keys and opens it with Enter", "takes two clicks on the same row to open it", "focuses the active list and highlights its first row") and `sessions-keys.test.ts`. No new tests: no new behavior.

## Implementation steps

1. Remove the resolved entry whole from `product/backlog/pull-request.md`, leaving the remaining entries and heading untouched.
2. Promote this plan to `product/plans/complete/`.
3. Commit and push to the PR head branch.

## Out of scope

- The remaining backlog entries, including the double-click focus rule (the fourth entry) and row-click behavior changes.
- Any description edit to the pull request.
