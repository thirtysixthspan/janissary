# Escape Closes the Editor Find Overlay From Anywhere in the Tab

**Complexity: 2/10** — the find overlay already closes on Escape typed into its own input; the gap is only that focus can leave that input while the overlay stays open, and the buffer's key handler then treats Escape as an ordinary editing key.

## Goal

Pressing Escape in an editor tab while the find overlay is open closes the overlay, whether focus is in the overlay's input or back in the buffer.

## Approach

Two paths let focus leave the find input while the overlay is still open:

1. Clicking a result row. The row is not focusable, so the mouse-down moves focus off the input and onto the page, where Escape reaches neither the overlay nor the buffer. Cancelling the row's mouse-down default keeps focus in the input, so the click still jumps and Escape still closes.
2. Clicking into the buffer. The buffer's hidden textarea takes focus, and its key handler maps Escape to the editing `escape` action (collapse the selection). When the overlay is open, the buffer's key handler now spends an unmodified Escape on closing the overlay instead, and keeps focus in the buffer. It runs after the suggest query line's handling, so an open query line still claims its own Escape first.

## Implementation steps

1. `web/src/editor/EditorFind.tsx`: cancel the default of a row's `mousedown` so the input keeps focus.
2. `web/src/editor/useEditorInteractions.ts`: in `onKeyDown`, after the suggest handling, close the find overlay on an unmodified Escape while it is open, and return without running any editing action.

## Tests

- `EditorFind.test.tsx`: a row's mouse-down is default-prevented, so pressing a row does not move focus off the input.
- `EditorTab.test.tsx`: with the overlay open and focus moved to the buffer, Escape closes the overlay, leaves the cursor on the previewed line, and keeps focus in the buffer.
- `EditorTab.test.tsx`: with the overlay open and a selection in the buffer, Escape from the buffer closes the overlay without collapsing the selection; a second Escape collapses it as usual.

## Spec and docs

- `product/specs/editor-tab.md` — "Finding a line": Escape closes the overlay from the buffer as well as from the input, and clicking a row keeps focus in the input.
- `documentation/user-documentation/tab-types/editor.md` — "Find a line": note that Escape closes the overlay even after you click into the file.

## Out of scope

- Closing the overlay by clicking into the buffer.
- Any change to what Escape does in the buffer while the overlay is closed.
