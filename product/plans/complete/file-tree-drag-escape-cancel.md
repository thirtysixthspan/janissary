# Escape cancels an in-progress file-tree drag

**Complexity: 3/10** — one more window-level listener alongside the existing mousemove/mouseup/blur
trio in `useFileTreeDrag.ts`, reusing the same cancel path the blur fix just introduced.

## Goal

Pressing Escape while dragging a file-tree row cancels the drag outright: the drag ghost label
disappears, no `moveFileTreeItem` is sent, and the tree returns to its pre-drag state — the same
outcome as releasing over empty space or the window losing focus mid-drag. Today, Escape does
nothing at all during a drag; the gesture stays active until the mouse button is eventually
released somewhere.

## Design decision

**Add a `keydown` listener on `window`, active only for the duration of the gesture — mirroring
the existing `blur` listener exactly.** `useFileTreeDrag.ts` already has the right shape for this:
`onRowMouseDown` attaches `mousemove`/`mouseup`/`blur` listeners for one gesture's lifetime, and
`onWindowBlur` already cancels the gesture via `resetGestureState()` + `removeGestureListeners()`
without committing a move. Escape needs the identical cancel behavior, triggered by a different
event, so a new `onWindowKeyDown` listener checks `e.key === 'Escape'` and calls the same two
functions. No change to `FileTreeTab.tsx`'s own `onKeyDown` is needed or appropriate: that handler
only fires when the tree container has DOM focus, but a drag's mousedown doesn't move keyboard
focus, and the gesture is already tracked independently of focus via `gestureRef` — a window-level
listener is the same pattern already used for the other three gesture-lifetime events.

## Implementation

1. **`web/src/useFileTreeDrag.ts`**:
   - Add `onWindowKeyDown(e: KeyboardEvent)`: if `gestureRef.current` is set and `e.key ===
     'Escape'`, call `resetGestureState()` then `removeGestureListeners()`.
   - In `onRowMouseDown`, add `globalThis.addEventListener('keydown', onWindowKeyDown)` alongside
     the existing three listeners.
   - In `removeGestureListeners`, add `globalThis.removeEventListener('keydown',
     onWindowKeyDown)`.

## Tests

- **`web/src/useFileTreeDrag.test.ts`** — add to the existing `describe('useFileTreeDrag')` block:
  - `pressing Escape during an active drag cancels it without sending anything` — start a drag past
    the threshold, dispatch a `keydown` with `key: 'Escape'` on `globalThis`, assert
    `draggedPath`/`dropTarget`/`dragPosition` are all reset and `client.send` was never called.
  - `a keydown that isn't Escape does not cancel an active drag` — dispatch an unrelated key (e.g.
    `'a'`) mid-drag and confirm the gesture is unaffected (`draggedPath` still set).
  - `pressing Escape with no active drag does nothing` — dispatch `Escape` with no prior
    `onRowMouseDown` call and confirm no error and no state change (guards `gestureRef.current`
    being null, matching the pattern already implied by `onWindowBlur`/`drop`).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the `useFileTreeDrag.test.ts`
  suite.
- Manual (not run in this environment): start dragging a file-tree row, press Escape while still
  holding the mouse button — confirm the drag ghost disappears immediately and the file is not
  moved.

## Out of scope

- The cmd+z undo and backspace/delete-confirmation entries in `work/issues.md` (separate, larger
  pieces of work).
- Any change to `resolveDropTarget`, `MoveConflictDialog`, or `FileTreeTab.tsx`'s own `onKeyDown`.
