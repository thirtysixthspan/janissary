# File navigator: click-drag-release to move files between directories

**Complexity: 5/10** — spans client and server with a new RPC message, a new client-side drag
state machine, a new confirmation dialog component, and new pure path-safety logic (self/descendant
checks), each requiring its own extraction to stay under the file-size limit.

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
   — a new `web/src/MoveConflictDialog/MoveConflictDialog.tsx`, built the same way
   `web/src/SaveChangesDialog/SaveChangesDialog.tsx` wraps `ModalDialog` (`web/src/ModalDialog.tsx`)
   and `useDialogKeyboard` (`web/src/useDialogKeyboard.ts`) — offering **Overwrite** / **Cancel**
   instead of Save/Don't Save/Cancel. Confirming replaces the existing entry; cancelling leaves
   both where they were.

5. **Scope.** Only the single selected row can be dragged — there is no multi-select in the file
   tree today (`web/src/FileTreeTab.tsx:27` tracks a single `selected: string | null`), and adding
   one is out of scope for this feature.

6. **Protocol.** A new RPC message, `moveFileTreeItem`, is added to the `RpcCall` union in
   `src/protocol.ts` (alongside `fileTreeToggle` / `fileTreeCollapseAll` / `fileTreeReroot` at
   lines 134–138): `{ method: 'moveFileTreeItem'; params: { index: number; fromRelPath: string;
   toRelPath: string } }` — tab identified by `index`, paths relative to the tree's root, matching
   the existing messages' shape.

7. **Server-side move.** `FileTreeManager` (`src/file-tree-manager.ts`) gets a new `move(label,
   fromRelPath, toRelPath)` method, added the same way as its existing `toggle` (line 97) /
   `reroot` (line 120) / `collapseAll` (line 111): resolve `state.root`-relative paths, mutate
   on-disk state, call `rebuild()`. The path-safety checks themselves (is `toRelPath` the same
   path as `fromRelPath`, or a descendant of it; does the destination already have an entry named
   like the source) are pure functions added to `src/file-tree.ts` alongside `readDirSorted` /
   `buildRows`, not inlined into `file-tree-manager.ts` — this is a firm decision, not conditional
   on hitting the 200-line limit: `file-tree-manager.ts` is already 187 lines, and `file-tree.ts`
   (53 lines) is precisely where the codebase already keeps this kind of pure, disk-reading logic,
   so `move()` calls into it rather than growing the manager. `move()` itself calls
   `renameSync` from `node:fs` (added to the existing `import { watch, statSync } from 'node:fs'`
   at `src/file-tree-manager.ts:1`).

8. **Client-side drag extraction.** For the same file-size reason, the drag gesture (mousedown,
   movement threshold, tracking the current drop-target row, mouseup handling) is not added
   directly into `web/src/FileTreeTab.tsx` (already 147 lines). It follows the existing split
   between `web/src/editor/mouse.ts` (pure hit-testing) and `web/src/editor/useEditorMouse.ts` (the
   hook wiring it into a component): a new `web/src/file-tree-drag.ts` holds the pure drag-state
   logic (given a row list, a dragged path, and a pointer position, which row — if any — is a
   valid drop target), and a new `web/src/useFileTreeDrag.ts` hook wires it to `startDrag()`
   (`web/src/drag-resize.ts`) and to `FileTreeTab`'s row elements. `FileTreeTab.tsx` calls the hook
   and renders the highlight/dialog based on the state it returns, the same way it already calls
   `handleFileTreeKey` from `web/src/file-tree-keys.ts` for keyboard handling.

9. **Docked trees.** `FileTreeTab` is the same component whether centered in the tab strip or
   docked into a sidebar (`autoFocus` is the only behavioral difference between the two mounts —
   `web/src/FileTreeTab.tsx:17`). The drag gesture needs no separate handling for the docked case:
   it is added once, in the shared component/hook, and applies identically in both mounts.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Reused for |
|---|---|---|
| `startDrag()` mouse-drag gesture helper | `web/src/drag-resize.ts` | Tracking mousemove/mouseup for the drag gesture |
| `mouse.ts` (pure) + `useEditorMouse.ts` (hook) split | `web/src/editor/mouse.ts`, `web/src/editor/useEditorMouse.ts` | Template for splitting drag logic into `file-tree-drag.ts` (pure) + `useFileTreeDrag.ts` (hook) instead of growing `FileTreeTab.tsx` |
| Row click/double-click handlers, row highlight styling, `selected` state | `web/src/FileTreeTab.tsx` (`onRowClick`/`onRowDoubleClick` at lines 54–64, `selected` state at line 27) | Extending with drag start/over/drop handling and target highlight |
| `fileTreeToggle` / `fileTreeReroot` / `fileTreeCollapseAll` RPC messages | `src/protocol.ts:134-138` | Shape/naming template for the new `moveFileTreeItem` message |
| Server-side dispatch for those messages | `src/message-handler.ts:55-60` (switch cases), `src/controller.ts:187-200` (controller methods resolving `index` → tab `label`) | Template for wiring the new `moveFileTreeItem` case and `controller.moveFileTreeItem(index, ...)` method |
| `toggle` / `reroot` / `collapseAll` methods and `rebuild()` | `src/file-tree-manager.ts` (lines 97, 111, 120) | Template for the new `move` method (resolve paths against `state.root`, mutate, rebuild) |
| `readDirSorted` / `buildRows` pure disk-reading helpers | `src/file-tree.ts` | Where the new path-safety helpers (self/descendant check, name-conflict check) are added, keeping `file-tree-manager.ts` from growing |
| `SaveChangesDialog` wrapping `ModalDialog` + `useDialogKeyboard` (Save/Don't Save/Cancel on close) | `web/src/SaveChangesDialog/SaveChangesDialog.tsx`, `web/src/ModalDialog.tsx`, `web/src/useDialogKeyboard.ts` | Template for the new `MoveConflictDialog` (Overwrite/Cancel) |
| Per-tab directory watchers | `src/file-tree-manager.ts` (`watchDir`/`unwatchDir`) | Tree already refreshes automatically once the move lands on disk — no separate refresh logic needed |

## Proposed changes

- **`web/src/file-tree-drag.ts`** (new, pure): given the current row list, the path being
  dragged, and the row currently under the pointer, decides whether that row is a valid drop
  target (must be a directory, not the dragged path itself, and not a descendant of it — using
  `/`-prefixed relative-path comparison the same way rows are already keyed by `path`) or a
  conflict target (destination already lists a same-named child, checked by name only — actual
  existence is re-verified server-side since the client's row list can be briefly stale).
- **`web/src/useFileTreeDrag.ts`** (new, hook): wires `file-tree-drag.ts` to `startDrag()`
  (`web/src/drag-resize.ts`), tracking a movement threshold before a drag is considered started;
  exposes the dragged path, the current valid/invalid/conflict drop-target row, and a `drop()`
  callback that either calls `client.send({ method: 'moveFileTreeItem', ... })` directly (valid,
  no conflict) or opens `MoveConflictDialog` first (conflict case).
- **`web/src/FileTreeTab.tsx`**: call `useFileTreeDrag`, attach its handlers to each row's
  `onMouseDown`, render the returned drop-target highlight class, and render
  `MoveConflictDialog` when the hook reports a pending conflict.
- **`web/src/MoveConflictDialog/MoveConflictDialog.tsx`** (new): mirrors
  `web/src/SaveChangesDialog/SaveChangesDialog.tsx` — wraps `ModalDialog` with `useDialogKeyboard`,
  two actions (Overwrite / Cancel) instead of three.
- **`src/protocol.ts`**: add the `moveFileTreeItem` message to the `RpcCall` union (next to
  `fileTreeReroot` at line 138).
- **`src/file-tree.ts`**: add the pure path-safety helpers described in design decision 7
  (self/descendant check, name-conflict check against a `buildRows`-shaped row list or a fresh
  `readDirSorted` call).
- **`src/file-tree-manager.ts`**: add a `move(label, fromRelPath, toRelPath)` method — resolves
  both paths against `state.root`, calls the new `file-tree.ts` helpers to reject invalid targets,
  performs the on-disk `renameSync`, and calls `rebuild()`.
- **`src/controller.ts`**: add a `moveFileTreeItem(index, fromRelPath, toRelPath)` method next to
  `fileTreeReroot` (line 197), resolving `index` → `label` the same way, then calling
  `this.managers.fileTree.move(label, fromRelPath, toRelPath)`.
- **`src/message-handler.ts`**: add a `case 'moveFileTreeItem':` next to the existing
  `fileTreeReroot` case (line 59), calling `controller.moveFileTreeItem(message.params.index,
  message.params.fromRelPath, message.params.toRelPath)`.
- **`specs/file-tree-tab.md`**: extend the "Mouse interactions" table (starting line 85) with the
  drag-drop row behavior and document the conflict dialog.

## Tests

- `web/src/file-tree-drag.test.ts` (new, mirroring `web/src/editor/mouse.test.ts`): pure
  drop-target logic — a directory row under the pointer is a valid target; a file row, the
  dragged row itself, and a descendant of the dragged directory are all invalid; a target whose
  children include a same-named entry is flagged as a conflict.
- `web/src/useFileTreeDrag.test.ts` (new, mirroring `web/src/editor/useEditorMouse.test.ts`):
  movement-threshold gating before a drag counts as started; `drop()` calls `client.send` directly
  for a valid non-conflicting target and opens the conflict flow instead for a conflicting one.
- `web/src/FileTreeTab.test.tsx`: extend with drag-start rendering the highlight on a valid
  directory target and no highlight on an invalid one; drop on a valid directory sends
  `moveFileTreeItem` with the right `fromRelPath`/`toRelPath` (following the existing assertion
  style at line 50, e.g. `expect(send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params:
  { index, fromRelPath, toRelPath } })`); drop on a conflicting name renders
  `MoveConflictDialog` instead of sending immediately.
- `web/src/MoveConflictDialog/MoveConflictDialog.test.tsx` (new, mirroring
  `web/src/SaveChangesDialog/SaveChangesDialog.test.tsx`): Overwrite calls `onOverwrite`, Cancel
  calls `onCancel`, matching keyboard shortcuts work via `useDialogKeyboard`.
- `src/file-tree.test.ts`: new cases for the path-safety helpers — self, descendant, and
  name-conflict detection, alongside the existing `readDirSorted`/`buildRows` tests.
- `src/file-tree-manager.test.ts` (existing conventions at lines 18+, e.g. the `toggle`/`reroot`
  tests at lines 111/184): add cases for `move()` — renames the file/directory on disk and
  triggers a `rebuild()`; rejects moving a directory into its own descendant; rejects moving an
  item onto itself.
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
