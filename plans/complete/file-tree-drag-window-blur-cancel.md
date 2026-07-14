# Cancel a file-tree drag when the window loses focus mid-drag

**Complexity: 2/10** — one new window-level listener added and removed alongside the existing
mousemove/mouseup pair in `useFileTreeDrag.ts`, reusing the same cleanup path drop() already has.

## Goal

Dragging a file-tree row and then moving the pointer out of the browser window entirely (onto the
OS desktop, another application, or another monitor) and releasing there today leaves the drag
stuck: the dragged-item ghost label freezes in place, `moveFileTreeItem` is never sent, and the
`mousemove`/`mouseup` window listeners are never removed. Only a fresh mousedown (or reload)
clears it, since no mouseup event ever reaches the page for a release outside its own window.
After this fix, the moment the window loses focus during an active drag, the drag is cancelled
outright: the ghost label disappears, no move is sent, and both window listeners are removed —
identical in effect to releasing over empty space.

## Design decision

**Listen for `blur` on `window`, not `mouseleave` on `document`.** The dragged-item ghost already
disappears correctly when the pointer merely moves over empty space *inside* the browser window
(`hoveredRowPath` returns `null`, `resolveDropTarget` returns `null`, and a release there already
no-ops via the existing `drop()` path) — that part of the reported behavior is already correct.
What's missing is the case where the pointer, and the mouseup that ends the gesture, happen
entirely outside the browser window. The reliable, cross-browser signal for "the window is no
longer the active one" is the `blur` event on `window`, which fires whenever focus leaves the page
(switching apps, virtual desktops, or even just clicking another monitor) — including cases a
`mouseleave` on `document` wouldn't reliably catch (a fast pointer move that exits without
generating a `mousemove` inside the document first).

**Reuse the existing cancel path, don't add a new one.** `onWindowUp` already does exactly what's
needed for "end the gesture without committing a move": clear `gestureRef`, reset the three pieces
of state, and detach both listeners. Extracting its cleanup into a small shared function used by
both `onWindowUp` (which still checks for and commits a valid drop first) and a new `onWindowBlur`
(which skips straight to cancelling — never commits a move on blur, since a window losing focus is
never itself a valid drop signal) avoids duplicating the teardown logic.

## Implementation

1. **`web/src/useFileTreeDrag.ts`**:
   - Extract the gesture teardown (`gestureRef.current = null`, `setDraggedPath(null)`,
     `setDragPosition(null)`, `setDropTarget(null)`, and detaching the `mousemove`/`mouseup`/new
     `blur` listeners) into a small `endGesture()` helper.
   - `onWindowUp` becomes: call `drop()` (unchanged — still checks for and commits a valid target),
     then `endGesture()`.
   - Add `onWindowBlur`, which calls `endGesture()` directly — no `drop()` call, so a blur never
     commits a move regardless of what's under the pointer at that instant.
   - In `onRowMouseDown`, add `globalThis.addEventListener('blur', onWindowBlur)` alongside the
     existing `mousemove`/`mouseup` listener registration.

## Tests

- **`web/src/useFileTreeDrag.test.ts`** — add to the existing `describe('useFileTreeDrag')` block:
  - `a window blur during an active drag cancels it without sending anything` — start a drag past
    the threshold, dispatch a `blur` event on `globalThis`, assert `draggedPath`/`dropTarget`/
    `dragPosition` are all reset and `client.send` was never called.
  - `a window blur after a drag has already ended does not affect subsequent gestures` — drop a
    drag normally, dispatch `blur`, start a fresh drag, and confirm it still behaves normally (the
    listener was correctly removed after the first gesture ended, so a stray `blur` afterward is a
    no-op and doesn't leak into the next drag).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the `useFileTreeDrag.test.ts`
  suite.
- Manual (not run in this environment): start dragging a file-tree row, then Cmd+Tab (or
  Alt+Tab) to another application while still holding the mouse button — confirm the drag ghost
  disappears immediately and the file is not moved.

## Out of scope

- The already-correct in-window "drop on empty space" no-op path — untouched.
- Escape-to-cancel and the same-directory-drop no-op (separate `work/issues.md` entries; the
  same-directory case was already fixed in a prior change).
- Any change to `resolveDropTarget` or `MoveConflictDialog`.
