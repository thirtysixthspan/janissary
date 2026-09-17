# PR 1129 — unfreeze a Shift+click that picks nothing

Complexity: 3/10

## Goal

A Shift+pointerdown followed immediately by a pointerup at the same point currently
leaves the terminal frozen behind a zero-length overlay that no plain click can dismiss
(the dismiss branch is gated on `layerHolds`, which is false for a zero-length range, so
`stateRef.current` stays non-null forever and the surface stays hidden). Release of a
gesture that picked nothing must drop the overlay, and any overlay on screen must be
dismissed and consumed by a plain click regardless of how long its range is.

## Approach

In `web/src/shared/terminal/useSelectionLayer.ts`:

- The `end` callback (the `pointerup` handler) clears the state when a released gesture
  holds nothing. A `dragging` flag — true only when `anchorRef.current` is non-null at
  release — keeps effect-teardown re-runs of `end()` from unfreezing a held overlay.
- The plain-pointerdown branch in `onDown` widens from `layerHolds(stateRef.current)`
  to `stateRef.current !== null`: dismissal now keys off the presence of a view, so an
  overlay holding a zero-length range is also cleared and the click consumed.
- `layerHolds` itself stays the non-empty-range test used by the selection bridge and the
  copy chord — the two conditions stay distinct, as the entry's Proposal requires.

## Implementation steps

1. `end`: capture `dragging` from `anchorRef.current` before nulling it; after removing
   the window listeners, `if (dragging && !layerHolds(stateRef.current)) clear()`.
2. `onDown`: plain-button branch tests `stateRef.current !== null` instead of
   `layerHolds(stateRef.current)`.
3. Tests in `web/src/shared/terminal/useSelectionLayer.test.tsx`:
   - a Shift+pointerdown followed immediately by a pointerup at the same point leaves
     no view (probe empty);
   - a plain pointerdown while a zero-length overlay is present clears it and prevents
     the event.

## Tests

Two new tests in `web/src/shared/terminal/useSelectionLayer.test.tsx`, mirroring the
existing `pointer`/`drag` helpers there. The tests that a drag holds its pick, that a
second Shift+drag replaces it, and that a plain click clears a real selection all keep
pinning behavior that must not move.

## Out of scope

- `layerHolds`' definition (later backlog entry: treats empty text as no selection).
- Formatting artifacts elsewhere in these files (later backlog entry).
- Any spec/doctrinal change beyond what behavior this alters.
