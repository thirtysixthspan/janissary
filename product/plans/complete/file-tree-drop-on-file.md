# File navigator: drop on a file to move into its parent directory

**Complexity: 4/10** — a self-contained change to one pure function
(`resolveDropTarget` in `web/src/file-tree-drag.ts`), no protocol or server changes; the existing
highlight and drop wiring in `FileTreeTab.tsx`/`useFileTreeDrag.ts` already works unchanged because
it keys off the resolved target's directory path, not the hovered row.

## Summary

Today, dropping a dragged row only registers over a directory row itself (`web/src/file-tree-drag.ts:22`,
`if (!target?.dir) return null;`) — hovering a file row, even one that lives inside the directory
you want to drop into, shows no highlight and a release there does nothing
(`specs/file-tree-tab.md:106-111`). This closes that gap per `work/issues.md`: "you should be able
to drop on a directory, or any file in that directory, to move the file to that directory." Hovering
a file row now resolves to that file's *parent* directory as the drop target, so any row in a
directory — not just the directory's own row — accepts a drop into that directory.

## Design decisions

1. **Resolving the effective target.** `resolveDropTarget` (`web/src/file-tree-drag.ts:19-28`)
   currently looks up the hovered row and rejects it outright if it isn't a directory. Instead,
   when the hovered row is a file, its parent directory path becomes the effective target — derived
   the same way `MoveConflictDialog`'s displayed name is derived from a full path
   (`.slice(0, lastIndexOf('/'))` for the parent, mirroring the existing `.slice(lastIndexOf('/') + 1)`
   used for the name at `web/src/FileTreeTab.tsx:154`/`:159`). A file at the tree's root (no `/` in
   its path) resolves to the root itself, represented the same way the existing conflict-path check
   already treats the root (`target.path ? ... : name` at `web/src/file-tree-drag.ts:25`) — an empty
   string.
2. **Blocking self-drops.** Dropping a row directly onto itself must stay blocked regardless of
   whether it's a file or directory. Previously this fell out of the descendant check for
   directories (`isSameOrDescendantPath(target.path, draggedPath)` where `target.path === draggedPath`);
   for a *file* target that check no longer applies once the target becomes its parent directory,
   so an explicit `hoveredPath === draggedPath` guard is added up front.
3. **Descendant/self checks run against the resolved parent, not the hovered row.** A dragged
   directory must still not be droppable into one of its own descendant files — e.g. dragging `src`
   and hovering `src/nested/file.ts` must resolve to `src/nested`, which the existing
   `isSameOrDescendantPath` check already rejects as a descendant of `src`. No new logic needed here
   beyond running the existing check against the resolved path instead of the raw hovered path.
4. **Highlighting requires no change.** `FileTreeTab.tsx:137` highlights whichever row's own
   `path` equals `drag.dropTarget?.path` — since `dropTarget.path` is now always the resolved
   *directory* path (never a file path), hovering a file inside `src` already highlights the `src`
   row itself once `resolveDropTarget` returns `{ path: 'src', ... }`. This is why the fix is scoped
   entirely to `file-tree-drag.ts`.
5. **Root-level file targets have no visible row.** The tree's root directory itself is never
   rendered as a row (`src/file-tree.ts:35-53` only ever pushes rows for the root's children).
   Hovering a root-level file therefore resolves to a valid target (`path: ''`) that highlights no
   row — the drop still succeeds on release, there's simply nothing to highlight for a target that
   isn't itself a row. This is documented as expected behavior in the spec update, not treated as a
   bug to fix.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Reused for |
|---|---|---|
| `isSameOrDescendantPath` | `web/src/file-tree-drag.ts:8-10` | Unchanged — now checked against the resolved parent path instead of the raw hovered path |
| Conflict check (`target.path ? ... : name`, root-as-empty-string convention) | `web/src/file-tree-drag.ts:25-26` | Same convention extended to the newly-derived parent path |
| Row highlight keyed off `dropTarget.path` | `web/src/FileTreeTab.tsx:137` | Unchanged — already highlights the resolved directory row regardless of which row was hovered |
| Name-from-path derivation (`.slice(lastIndexOf('/') + 1)`) | `web/src/FileTreeTab.tsx:154`, `:159` | Template for the new parent-path derivation (`.slice(0, lastIndexOf('/'))`) |

## Proposed changes

- **`web/src/file-tree-drag.ts`**: add a `parentPath(path: string): string` helper (root files —
  no `/` — return `''`). In `resolveDropTarget`, add an explicit `hoveredPath === draggedPath`
  guard; when the hovered row exists and is a file, use `parentPath(hovered.path)` as the
  candidate target path instead of rejecting it; keep the existing descendant check and conflict
  check unchanged, just run them against the resolved path.
- **`specs/file-tree-tab.md`**: update the "Moving files by drag-and-drop" section (starting line
  103) — dropping is no longer restricted to directory rows; releasing over any file row moves the
  dragged item into that file's containing directory, with the containing directory highlighted
  the same way. Note the root-level edge case (no visible row highlights when the target is the
  tree's own root).

## Tests

- `web/src/file-tree-drag.test.ts`: replace the existing "is null when hovering a file row" case
  (no longer accurate) with cases showing a file row resolves to its parent directory — a file
  nested one level in, a conflicting-name case detected via a file hover instead of a directory
  hover, and a root-level file resolving to `{ path: '', conflict: false }`. Add a case confirming
  hovering the dragged file itself (not a directory) is still blocked. Keep the existing
  directory-hover, self-directory, descendant, `".."`, and null-hover cases as regression coverage.
- `web/src/FileTreeTab.test.tsx`: update "dragging a file over another file row shows no highlight"
  — hovering a file inside a directory now highlights that directory's own row, not the hovered
  file row itself; add a case for the drop actually sending `moveFileTreeItem` with the parent
  directory as `toRelPath` when released over a file row.

## Out of scope

- Any change to the conflict-dialog flow itself (still triggered the same way once the target
  resolves).
- Multi-select or cross-tree drags (already out of scope per the original drag-move plan).
- Visually indicating the root as a drop target when no row represents it.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual check: open a `files` tab, expand a directory containing at least one file, drag another
  file and release it directly over that file (not the directory row) — confirm the directory row
  highlights during the drag and the file moves into that directory on release.
