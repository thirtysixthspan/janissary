# PR 1129: scope the terminal selection layer's Escape handling to its own surface

Complexity: 3/10

## Goal

A held terminal selection's Escape-to-clear must only apply to the terminal surface holding it, so Escape pressed anywhere else reaches whatever owns it, and the layer stops swallowing every Escape the app sees.

## Approach

The hook `useSelectionLayer` installs a window-capture `keydown` listener whenever a snapshot exists, so Escape never reaches the rest of the app. Move the listener onto the surface's container, drop `stopPropagation()`, and make it the sole owner of the clear: delete the unreachable Escape branch in `useXterm`'s custom key handler and its HarnessTab test that calls the captured handler directly.

## Implementation steps

1. In `web/src/shared/terminal/useSelectionLayer.ts`, replace the window-level `keydown` listener with a capture listener on the container element, gated on a view existing, clearing on Escape with only `preventDefault()`.
2. In `web/src/shared/terminal/useXterm.ts`, delete the `Escape && layerHeld` branch from `attachCustomKeyEventHandler`.
3. In `web/src/harness/HarnessTab.test.tsx`, delete the `clears on Escape and does not send the key to the harness` test (it drives the removed branch directly).

## Tests

- `useSelectionLayer.test.tsx`: Escape keydown on the container clears the held selection and is defaultPrevented; Escape keydown on the window (outside the container) leaves the selection held and is not defaultPrevented.
- Existing HarnessTab tests for Escape reaching the harness with nothing selected continue to pass.

## Out of scope

- The other pull-request backlog entries; ordering questions between the layer and xterm's key handler no longer arise since the emulator branch is deleted.
