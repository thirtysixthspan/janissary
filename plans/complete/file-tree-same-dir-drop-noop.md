# Dropping a file back into its own directory should silently no-op

**Complexity: 2/10** — a single missing case in an existing pure function; the fix and its test
follow the exact pattern already used by the other "invalid target" cases in the same file.

## Goal

Dragging a row and releasing it over another row that's already inside the dragged item's current
directory (including the directory's own row) should do nothing — no move request sent, and
critically no conflict dialog. Today, releasing over any row inside the file's current parent
directory is treated as a same-name conflict against the file itself, so `MoveConflictDialog` pops
up asking to overwrite the file with itself.

## Design decision

**Fix in `resolveDropTarget`, not in the conflict dialog or `drop()`.** `resolveDropTarget`
(`web/src/file-tree-drag.ts`) already special-cases invalid targets — hovering the dragged item
itself, hovering one of its own descendants — by returning `null`. Hovering the dragged item's
*current parent* (i.e., dropping it back where it already lives) is the same class of "not a real
move" case and belongs in the same guard, computed the same way `isSameOrDescendantPath` already
is. Returning `null` here makes `useFileTreeDrag.ts`'s `drop()` no-op automatically — `target` is
falsy so neither `send` nor `setPendingConflict` runs — with no changes needed outside
`file-tree-drag.ts`.

## Implementation

1. **`web/src/file-tree-drag.ts`** — in `resolveDropTarget`, after computing `targetPath`, add:
   if `targetPath === parentPath(draggedPath)`, return `null` before the conflict check runs.
   Place it alongside the existing `isSameOrDescendantPath` guard since both represent "this isn't
   a valid destination for this drag."

## Tests

- **`web/src/file-tree-drag.test.ts`** — add cases to the existing `describe('resolveDropTarget')`
  block:
  - `is null when hovering another row already inside the dragged item's own directory` — drag
    `dest/index.ts`, hover `dest` (the file's own parent directory row) → `null`.
  - `is null when hovering a sibling file inside the dragged item's own directory` — drag
    `src/index.ts`, hover a second file placed alongside it in `src` → `null` (covers the
    file-row-resolves-to-parent path, not just hovering the directory row directly).
  - A root-level case: drag `README.md`, hover another root-level file → `null` (parent is `''`
    for both).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the `file-tree-drag.test.ts`
  suite.
- Manual (not run in this environment): drag a file and drop it back onto its own containing
  directory in the file navigator — confirm no conflict dialog appears and the file stays put.

## Out of scope

- The drag-outside-window and Escape-to-cancel issues (separate entries in `work/issues.md`).
- Any change to `useFileTreeDrag.ts` or `MoveConflictDialog` — the existing no-op path through
  `drop()` already handles a `null` target correctly.
