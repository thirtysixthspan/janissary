# PR 1129 — the selection gesture takes the mouse and the focus explicitly

Complexity: 4/10

## Goal

The hook's capture-phase `pointerdown` with `stopPropagation()` never touches xterm's
`mousedown`-bound selection service and mouse reporting, and the browser's suppression
of the compatibility mouse event is the only thing standing between the gesture and the
harness — the same suppression that leaves the terminal unfocused, so a Shift+drag
started with focus elsewhere produces a pick neither the copy chord nor `Cmd+I` can
reach.

## Approach

Register capture-phase `mousedown` and `click` listeners on the container alongside the
existing `pointerdown` one. Both are pure guards — they apply the same modifier test
(Shift-left gesture, or the plain unmodified click that dismisses) and call
`preventDefault()`/`stopPropagation()` when they own the event, but never change state;
the `pointerdown` handler stays the one place that snapshots. The Shift+pointerdown
branch focuses the terminal (`termRef.current?.focus()`), so the copy chord and the
`Cmd+I` context-menu path — both resolving through the focused element — see the surface
holding the pick.

## Implementation steps

1. `web/src/shared/terminal/useSelectionLayer.ts`: add the `mousedown` guard (gesture and
   dismiss branches) and `click` guard (consumed while the layer holds a view or the
   gesture owns the click) in capture phase; register and clean them up with the others.
2. Add `termRef.current?.focus()` in the Shift branch of the `pointerdown` handler.
3. Update the header comment that credits compatibility-event suppression for the take.
4. Tests in `web/src/shared/terminal/useSelectionLayer.test.tsx` (the fake terminal grows
   a `focus` member): a `mousedown` following the gesture's `pointerdown` is
   defaultPrevented and does not propagate; the terminal's `focus` is called on
   Shift+pointerdown. The real check — that a running harness neither sees the mouse nor
   reacts — stays manual, per the entry.

Out of scope: listener-key change to the other modifier tests (the entry's own noted
risk); `Cmd+I` wiring (already resolves through focus).
