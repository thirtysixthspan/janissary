# Closing the editor find overlay with Escape must not scroll the buffer

**Complexity: 1/10** — ~3 added lines, 1 file, 2 requirements, 2 scenarios (p=3.36)

Pressing Escape in the editor's Cmd+F find overlay closes it and hands focus back to the buffer's hidden textarea with a plain `focus()`. The textarea is pinned to the top of the scrollport (see `theme.css`), so the browser scrolls the buffer back to the top to reveal it.

## Goal

Escape closes the find overlay, leaves the cursor where the last previewed match put it, returns keyboard focus to the buffer, and does not change the buffer's scroll position.

## Approach

In `web/src/editor/EditorTab.tsx`, the `LineFind` `onClose` handler refocuses the textarea through the existing `refocusBuffer` helper, which calls `focus({ preventScroll: true })`, the same call the autofocus effect and the overwrite dialog already use.

## Implementation steps

1. Replace `textareaRef.current?.focus()` in the `LineFind` `onClose` with `refocusBuffer()`.

## Tests

In `web/src/editor/EditorTab.test.tsx`, under the find overlay suite:

- Escape in the overlay's input refocuses the textarea with `{ preventScroll: true }`.
- Escape in the overlay still closes it, keeps the cursor on the previewed line, and leaves the textarea focused (existing test).

## Out of scope

- The scroll that the overlay performs on purpose while previewing a match.
- Other overlays' close behavior.
