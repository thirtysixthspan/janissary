# File navigator: click-drag-release to move files between directories

## Summary

The file tree tab currently supports click (select), double-click (open/expand), and keyboard
navigation, but no way to relocate a file or directory on disk from within the tree. This adds a
click-drag-release gesture: pressing down on a row and dragging it onto a directory row, then
releasing, moves that file or directory into the target directory. This closes the gap between the
tree's read/browse capabilities and basic file management, matching the drag-to-move affordance of
a conventional OS file explorer.

## Design decisions

1. **Drag trigger.** A drag starts with mousedown-and-move on a row (past a small movement
   threshold), reusing the existing `startDrag()` gesture helper (`web/src/drag-resize.ts`) that
   already backs the sidebar/panel resize dividers. There is no separate drag-handle affordance —
   the whole row is draggable, consistent with the row already being the full click target for
   selection.

2. **Drop target feedback.** While dragging, the directory row currently under the cursor is
   highlighted (visually similar to the existing selection highlight) to indicate it as the drop
   target. Only directory rows can highlight; hovering a file row or empty space shows no
   indicator and a release there is a no-op.

3. **Invalid drops.** Dropping onto a file row, onto the dragged item itself, or onto one of the
   dragged directory's own descendants is blocked outright — no highlight is shown for these
   targets, and releasing over one is a no-op (nothing moves, no error).

4. **Name conflicts.** If the destination directory already contains an entry with the same name
   as the dragged item, the move does not happen silently. Instead a confirmation dialog appears
   (reusing the existing `ModalDialog`/confirm-dialog pattern already used for close-with-unsaved
   changes) offering **Overwrite** / **Cancel**. Confirming replaces the existing entry; cancelling
   leaves both where they were.

5. **Scope.** Only the single selected row can be dragged — there is no multi-select in the file
   tree today, and adding one is out of scope for this feature.

6. **Protocol.** A new RPC message, `moveFileTreeItem`, is added: `{ method: 'moveFileTreeItem';
   params: { index: number; fromRelPath: string; toRelPath: string } }`, following the existing
   `fileTreeToggle` / `fileTreeReroot` shape (tab identified by `index`, paths relative to the
   tree's root).

7. **Server-side move.** The actual `fs.rename` call and conflict check live in a new `move`
   method on `FileTreeManager` (`src/file-tree-manager.ts`), alongside its existing `toggle` /
   `reroot` / `collapseAll` methods — same pattern of resolving relative paths against
   `state.root`, mutating on-disk state, then calling `rebuild()`. If adding this method pushes
   `file-tree-manager.ts` past the 200-line guideline, the conflict-check logic is split into a
   separate module (e.g. `src/file-tree-move.ts`) that `FileTreeManager` calls into, per the
   project's file-size convention (extract, don't compact).

## What already exists (reuse, don't rebuild)

| Existing piece | File | Reused for |
|---|---|---|
| `startDrag()` mouse-drag gesture helper | `web/src/drag-resize.ts` | Tracking mousemove/mouseup for the drag gesture |
| Row click/double-click handlers, row highlight styling | `web/src/FileTreeTab.tsx` | Extending with drag start/over/drop handling and target highlight |
| `fileTreeToggle` / `fileTreeReroot` / `fileTreeCollapseAll` RPC messages | `src/protocol.ts` | Shape/naming template for the new `moveFileTreeItem` message |
| `toggle` / `reroot` / `collapseAll` methods and `rebuild()` | `src/file-tree-manager.ts` | Template for the new `move` method (resolve paths against `state.root`, mutate, rebuild) |
| Confirmation dialog pattern (Save/Don't Save/Cancel on close) | close-with-unsaved-changes flow (see `specs/editor-tab.md`) | Template for the Overwrite/Cancel conflict dialog |
| Per-tab directory watchers | `src/file-tree-manager.ts` (`watchDir`/`unwatchDir`) | Tree already refreshes automatically once the move lands on disk — no separate refresh logic needed |

## Proposed changes

- **`web/src/FileTreeTab.tsx`**: add mousedown-driven drag state (dragged row, current
  drop-target row) using `startDrag()`; render the drop-target highlight; on mouseup over a valid
  directory target, either send `moveFileTreeItem` directly (no conflict) or open the confirmation
  dialog first (conflict case, determined client-side from the already-known row list) before
  sending it.
- **`web/src/ModalDialog.tsx`** (or a small wrapper around it): reused as-is for the
  Overwrite/Cancel prompt; no new dialog primitive needed.
- **`src/protocol.ts`**: add the `moveFileTreeItem` message to the `RpcCall` union.
- **`src/file-tree-manager.ts`**: add a `move(label, fromRelPath, toRelPath)` method — resolves
  both paths against `state.root`, rejects moves onto self/descendant, performs the on-disk
  rename, and calls `rebuild()`. Wired from wherever the RPC dispatcher routes `fileTreeToggle`
  etc. today.
- **`specs/file-tree-tab.md`**: extend the "Mouse interactions" table with the drag-drop row
  behavior and document the conflict dialog.

## Tests

- `web/src/FileTreeTab.test.tsx`: drag-start sets internal drag state; dragging over a directory
  row shows the highlight; dragging over a file row or the dragged row itself shows none; drop on
  a valid directory sends `moveFileTreeItem` with the right `fromRelPath`/`toRelPath`; drop on a
  conflicting name opens the confirmation dialog instead of sending immediately, and confirming it
  sends the message while cancelling sends nothing.
- `src/file-tree-manager.test.ts`: `move()` renames the file/directory on disk; rejects moving a
  directory into its own descendant; rejects moving an item onto itself; overwrites correctly when
  called after a confirmed conflict.
- `web/src/drag-resize.ts` itself needs no new tests — reused unchanged.

## Out of scope

- Multi-select drag (moving several rows in one gesture).
- Dragging files onto tabs outside the file tree (e.g. dropping onto an editor tab to open it).
- Undo for a completed move.
- Cross-tree drags (dragging between two separate file tree tabs rooted at different paths).

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual check: open a `files` tab on a directory with at least two subdirectories and a file.
  Drag the file onto one subdirectory — confirm it disappears from its original spot and appears
  under the target after the tree's watcher-driven refresh. Repeat with a same-named file already
  present in the target to confirm the Overwrite/Cancel dialog appears and each button behaves as
  described.
