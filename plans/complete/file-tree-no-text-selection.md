# File Tree No Text Selection on Double-Click

**Complexity:** 1/10

## Goal

Double-clicking a file tree row to open a file or toggle a directory should not cause the browser to select the filename text.

## Approach

Add `user-select: none` to the `.files-row` CSS class in `theme.css`. This follows the existing pattern in the codebase (`.editor-gutter`, `.image-meta` already use `user-select: none`) and eliminates accidental text selection across all interactions (single-click, double-click, drag) — consistent with how file tree widgets behave in VS Code and other editors.

## Implementation

### `web/src/theme.css`

Add `user-select: none` to the `.files-row` rule block.

## Tests

No new tests — this is a CSS-only change. `check-diff` must pass.

## Spec

Add a note to `specs/file-tree-tab.md` Mouse interactions table: "Double-clicking a row does not select the row's text."

## Out of scope

- Other double-click behaviors in the app (tabs, command history)
- Preventing selection via event handlers (the CSS approach is simpler and more robust)
