# File navigator: visual indicator while dragging a row

**Complexity: 3/10** — extends the existing drag state machine with one more piece of state
(the live cursor position) and adds a small absolutely-positioned label in the tab that already
renders drop-target highlighting; no new files, no protocol changes.

## Summary

The file tree's click-drag-release gesture (`web/src/useFileTreeDrag.ts`,
`web/src/FileTreeTab.tsx`) already tracks `draggedPath` and highlights the hovered directory row
as a drop target, but gives no feedback that a drag is in progress at the cursor itself — the only
visible cue today is the target row's highlight. This adds a small label showing the dragged
item's filename that follows the mouse cursor for the duration of the drag, closing the gap
described in `work/issues.md`: "there should be a visual indicator that the drag is in process,
for example, the filename following the mouse."

## Design decisions

1. **Position tracking.** `useFileTreeDrag.ts` already receives `e.clientX`/`e.clientY` on every
   `mousemove` in `onWindowMove` (`web/src/useFileTreeDrag.ts:50-59`) and already gates the
   coordinates behind the same `DRAG_THRESHOLD_PX` check that sets `draggedPath`. A new
   `dragPosition: { x: number; y: number } | null` state is added, set alongside `draggedPath`
   once the gesture starts and updated on every subsequent move — reusing the same threshold gate,
   no new logic path.
2. **Label content.** The label shows just the dragged item's file/directory name (not its full
   relative path), matching how `MoveConflictDialog` already derives a display name from a path
   via `.slice(path.lastIndexOf('/') + 1)` (`web/src/FileTreeTab.tsx:151`) — the same expression is
   reused in `FileTreeTab.tsx` for the ghost label.
3. **Rendering.** The label is a plain `position: fixed` element rendered by `FileTreeTab.tsx`
   next to the existing row list, shown only while `drag.draggedPath` and `drag.dragPosition` are
   both set. It carries `pointer-events: none` so it never intercepts the `mousemove`/`mouseup`
   listeners the drag gesture depends on, and a small fixed offset from the cursor (so the label
   sits beside the pointer rather than under it, matching common OS drag-ghost placement).
4. **Cleanup.** `dragPosition` resets to `null` in `drop()` (`web/src/useFileTreeDrag.ts:38-48`)
   the same place `draggedPath` and `dropTarget` already reset, so the label disappears the moment
   a drag ends, valid or not.
5. **Scope.** No change to `file-tree-drag.ts`'s pure drop-target logic, no protocol change, no
   change to the conflict dialog — this only adds a cursor-following label during an
   already-started drag.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Reused for |
|---|---|---|
| `draggedPath` state, `DRAG_THRESHOLD_PX` gate, `onWindowMove` | `web/src/useFileTreeDrag.ts:18,50-59` | Adding `dragPosition` alongside the same gate, no new gesture logic |
| Name-from-path derivation (`.slice(path.lastIndexOf('/') + 1)`) | `web/src/FileTreeTab.tsx:151` | Deriving the ghost label's text from `draggedPath` |
| `.files-row.drop-target` styling pattern | `web/src/theme.css:560` | Template for the new `.files-drag-ghost` rule (same file, same section) |
| `drop()` resetting `draggedPath`/`dropTarget` | `web/src/useFileTreeDrag.ts:38-48` | Same place `dragPosition` resets to `null` |

## Proposed changes

- **`web/src/useFileTreeDrag.ts`**: add `dragPosition` state, set it in `onWindowMove` once the
  gesture has started (same branch that already calls `setDraggedPath`), reset it to `null` in
  `drop()`, and return it from the hook.
- **`web/src/FileTreeTab.tsx`**: render a `.files-drag-ghost` element positioned at
  `drag.dragPosition` showing the dragged item's name, only while `drag.draggedPath` is set.
- **`web/src/theme.css`**: add a `.files-drag-ghost` rule — fixed position, `pointer-events: none`,
  small offset from the cursor, styled consistently with the existing `.files-row.drop-target`
  look (same background/border tokens).
- **`specs/file-tree-tab.md`**: extend the "Moving files by drag-and-drop" section (starting line
  103) to document the cursor-following label.

## Tests

- `web/src/useFileTreeDrag.test.ts`: dragging past the threshold sets `dragPosition` to the
  current pointer coordinates; further movement updates it; `drop()` resets it to `null` alongside
  `draggedPath`.
- `web/src/FileTreeTab.test.tsx`: starting a drag renders the ghost label with the dragged file's
  name; releasing the drag removes it.

## Out of scope

- Any change to which rows are valid drop targets or how conflicts are resolved.
- A richer drag preview (e.g. a small icon, opacity change on the source row).
- Touch/pointer-event support (the gesture is mouse-only today, as is this addition).

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual check: open a `files` tab, press down on a row and drag — confirm a small label showing
  the file's name follows the cursor for the duration of the drag and disappears on release.
