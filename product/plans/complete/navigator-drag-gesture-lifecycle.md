# Give file-navigator drag gestures one lifecycle

## Complexity

6/10 — a lifecycle rewrite of the drag hook's listener management with new unmount, cleanup, and repeated-start coverage; the hook's signature and returned shape are unchanged.

## Goal

The file-navigator drag hook acquires four window listeners in its mouse-down handler without effect cleanup, and its public `drop` resets gesture state but leaves listener removal to a separate mouse-up wrapper. Unmounting a navigator during a drag leaves callbacks holding its move and insertion actions alive, so a later mouse release can act on a surface that has already closed, and unfinished gestures can leak between tests.

## Approach

In `web/src/file-navigator/useFileNavigatorDrag.ts`:

- Each started gesture owns an exact listener-removal closure stored in a ref; starting a gesture releases any previous one before registering another.
- The same idempotent disposer serves mouse-up, blur, Escape, the public `drop`, and an unmount effect.
- `drop` commits inside a `try` and releases the listeners in `finally`, so a throwing destination (an `insertAtCaret` into a surface mid-teardown) cannot retain them.
- Unmount cancels without moving files or inserting text: it clears the retained gesture and removes any command-bar highlight directly, without setting local React state after teardown.
- The hook's signature and returned shape are unchanged: `FileNavigatorTab.tsx` is its only production caller, while `FileNavigatorRows.tsx`, `FileNavigatorOverlays.tsx`, and `use-file-navigator-row-events.ts` consume its return type and need no edits.

## Implementation

1. Add the disposer ref and `releaseGestureListeners`; rework `onRowMouseDown` to replace any previous gesture.
2. Rework `drop` to try/finally; simplify `onWindowUp`, `onWindowBlur`, and `onWindowKeyDown` to go through it.
3. Add the unmount effect.
4. Extract the DOM hit-testing helpers (`hoveredElement`, `hoveredHarnessPty`, `hoveredRowInfo`) into a new `web/src/file-navigator/drag-hover.ts` — the lifecycle work pushed the hook over the 200-line limit, and the hover helpers are a cohesive group that reads naturally as its own module.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

Extend `web/src/file-navigator/useFileNavigatorDrag.test.ts` with: unmount before release (later window events neither send a move request nor invoke an insertion handle), direct-`drop` cleanup, repeated gesture start (the first gesture's listeners are gone), and a throwing-drop case (listeners still released). Existing tests cover blur, Escape, target-specific insertion, and move conflicts — some finish with a live gesture or call `drop` directly; keep their assertions while making teardown explicit. `useFileNavigatorMoveOperations.test.ts` stays as the downstream move regression check.

## Out of scope

- Drop-target selection and DOM hit testing.
- The hook's public signature or returned shape.
