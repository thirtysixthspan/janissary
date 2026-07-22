# File navigator rename should focus the renamed item

**Complexity: 2/10** — a focused client-side callback change and one regression test; no new
architecture or server behavior.

## Goal

After renaming a file or directory in the file navigator, keyboard focus should return to the tree
and the renamed row should remain selected so the next keyboard action applies to that item.

## Approach

Give the file-tree rename hook the tree container's existing focus callback. After a successful
rename, select the new path and focus the container. Leave no-op, cancel, and conflict-dialog
flows unchanged.

## Implementation steps

1. Add a focus callback parameter to `useFileTreeRename` and invoke it after sending a successful
   rename request.
2. Pass `containerRef.current?.focus()` from `FileTreeTab` when constructing the rename hook.

## Tests

- Extend `web/src/FileTreeTab.test.tsx` to verify that committing a changed file name selects the
  renamed row and returns focus to the tree container.

## Spec updates

- Update `product/specs/file-tree-tab.md` to state that a completed rename selects the renamed row
  and returns keyboard focus to the tree.

## Docs

Checked `help.md` and `documentation/user-documentation/`. Neither describes post-rename keyboard
focus, so no public documentation update is needed.

## Out of scope

- Server-side rename behavior, rename conflict handling, and cancellation behavior.
- The other backlog issues.
