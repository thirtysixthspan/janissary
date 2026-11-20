# Freeze editor drag selection when the pointer leaves the tab

**Complexity: 2/10** — ~10 production lines added, 1 file edited, 3 requirements / 5 scenarios (p=4.03).

## Goal

When selecting text in the editor with the mouse, dragging the pointer out of the editor tab must not
grow or otherwise change the selection. The selection stays frozen at the last position reached
inside the tab, and resumes following the pointer once it comes back over the tab. Today, dragging
out of the tab selects everything from the anchor to the start or end of the buffer, which is almost
never what the user intended.

## Root cause

`web/src/editor/mouse.ts` `hitFromPoint` is the drag hit test, called from `onWindowMove` in
`web/src/editor/useEditorMouse.ts` for every mousemove while a drag is active. When
`document.elementFromPoint` resolves to an element the editor body does not contain — another tab,
a panel, or nothing at all outside the viewport — `hitFromPoint` falls into a clamp fallback that
returns `{ line: 0, col: 0 }` or the last line with `col: MAX_SAFE_INTEGER`. `extendTo` then sets the
selection all the way to the buffer edge. The clamp was written for drags that leave the body, which
is exactly the behavior this fix removes.

## Approach

Make `hitFromPoint` return `null` when the point cannot be resolved to an element inside the editor
body. `onWindowMove` already ignores a null hit (`if (hit) extendTo(hit)`), so the selection simply
stops updating while the pointer is off the tab, and starts updating again when the pointer returns
over a row. `visualVerticalHit` currently routes through a private `rowHitAt` that duplicates the
same resolve-or-null logic; with the clamp gone the two functions are identical, so
`visualVerticalHit` calls `hitFromPoint` directly and the duplicate is removed.

## Implementation steps

1. **`web/src/editor/mouse.ts`** — in `hitFromPoint`, replace the first/last-line clamp fallback with
   `return null`, and rewrite its comment to state the null contract (pointer outside the editor
   body freezes the drag). Remove the now-duplicate `rowHitAt` helper and have `visualVerticalHit`
   call `hitFromPoint(body, rect.left, y)`; adjust comments that referenced the clamp.

2. **`web/src/editor/mouse.test.ts`** — add a `hitFromPoint` describe block with a mocked
   `elementFromPoint` (matching the existing `visualVerticalHit` style) covering: a row under the
   pointer inside the body resolves to a hit; a point over an element outside the body returns null;
   a point that resolves to no element returns null.

3. **`web/src/editor/useEditorMouse.test.ts`** — add a drag test: start a drag inside the body, move
   the pointer onto an element outside the body (no new selection update), then move it back onto a
   row in the body (selection update resumes).

4. **`product/specs/editor-tab.md`** — extend the existing mouse-selection paragraph in the Keyboard
   input section with the freeze/resume behavior.

5. Run `$janissary/scripts/run.mjs check-diff` after each step; all checks must pass.

## Tests

- `web/src/editor/mouse.test.ts` → `hitFromPoint`:
  - resolves the row under a pointer inside the editor body
  - returns null when the pointer is over an element outside the body
  - returns null when the point resolves to no element
- `web/src/editor/useEditorMouse.test.ts`:
  - a drag keeps the selection frozen while the pointer is outside the tab and resumes when it returns

## Out of scope

- Cursor placement on mousedown, word/line selection on double/triple click, and gutter selection —
  unchanged.
- Keyboard vertical movement and the `visualVerticalHit` scrollport guard — behavior unchanged;
  only the helper it calls is simplified.
- No changes to `useEditorMouse.ts`, scroll handling, or any other tab type.

## Verification

`$janissary/scripts/run.mjs check-diff` passes clean, including the new regression tests that fail
against the old clamp. Manual (browser): open a long file, drag to select from the middle toward
another tab, move off the tab — the selection stops at the last row inside the editor; move back in
and it follows the pointer again.
