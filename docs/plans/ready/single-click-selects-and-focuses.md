# Single-click in file tree selects and focuses

**Complexity: 1/10** — one-line change to add `containerRef.current?.focus()` to `onRowClick`.

## Goal

Clicking a row in the file navigator tab should select it (highlight it) and ensure the container has focus so keyboard navigation (arrow keys, Enter, etc.) works immediately after a click.

## Background

`onRowClick` already calls `setSelected(row.path)`, which highlights the clicked row. However, it doesn't ensure the container `<div>` has keyboard focus. If the container somehow loses focus (e.g., when the tree tab was just opened, or after interacting with another UI element), clicking a row should re-establish focus so the arrow keys and other shortcuts work without an extra click.

## Implementation

1. **`web/src/FileTreeTab.tsx`** (line 48-50): Add `containerRef.current?.focus()` after `setSelected(row.path)` in `onRowClick`.

## Tests

No new tests needed — existing keyboard navigation tests (in `file-tree-keys.test.ts`) verify that keyboard input works when the container has focus. The change is trivially small and verified by `check-diff`.

## Out of scope

- Changing double-click behavior or keyboard handling.
- Any changes outside `FileTreeTab.tsx`.
