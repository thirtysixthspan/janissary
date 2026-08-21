# Triple click in the editor selects the whole line

**Complexity: 2/10** — one new branch in `useEditorMouse.ts`'s existing click-detail dispatch,
reusing the `linesSelection`/`beginDrag` machinery the gutter-click path already has. No new state,
no new model code.

## Goal

Double-clicking a line in the editor tab already selects the word under the cursor
(`e.detail >= 2` in `useEditorMouse.ts`'s `onMouseDown`). A third click in the same spot (browser
`detail === 3`) is currently swallowed by that same `>= 2` check, so it just re-runs word selection
instead of the conventional editor behavior of selecting the entire line. Triple click should select
the whole line, matching the gutter-click/drag line-selection behavior that already exists.

## Approach

`useEditorMouse.ts` already has everything triple-click line selection needs: `linesSelection(s,
anchorLine, hitLine)` builds a whole-line selection (used today for gutter click and gutter drag),
and `beginDrag({ anchor, lineMode: true, anchorLine })` wires up drag-to-extend in line mode (also
used by the gutter path). Add a `e.detail >= 3` branch above the existing `e.detail >= 2` word-select
branch in `onMouseDown`, calling the same two calls the gutter-click branch makes, so a triple click
(and a click-drag that starts as a triple click) behaves identically to a gutter click/drag on that
line — the only difference is that it can originate from clicking inside the line's text rather than
its gutter margin.

## Implementation steps

1. In `web/src/editor/useEditorMouse.ts`'s `onMouseDown`, add a branch before the existing
   `if (e.detail >= 2)` word-selection branch:
   ```ts
   if (e.detail >= 3) {
     api.setState(linesSelection(s, hit.line, hit.line));
     beginDrag({ anchor: { line: hit.line, col: 0 }, lineMode: true, anchorLine: hit.line });
     return;
   }
   if (e.detail >= 2) {
     const range = wordRangeAt(s.lines, hit.line, hit.col);
     api.setState(setSelection(s, range.start, range.end));
     return;
   }
   ```
2. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `web/src/editor/useEditorMouse.test.ts`, mirroring the existing `'selects word on double
click'` and `'selects whole line on gutter click'` tests:

- `'selects whole line on triple click'` — dispatch a mousedown on a `.editor-content` cell with
  `detail: 3`; assert `api.setState` was called with a selection whose `anchor` is
  `{ line: <hit line>, col: 0 }` and whose `cursor` sits at the start of the next line (matching
  `linesSelection`'s shape, same assertion style the gutter-click test already uses).
- `'extends line selection on triple-click drag'` — mirroring `'extends line selection on gutter
  drag'`: triple-click mousedown on line 0's content, then dispatch a `mousemove` resolving to line
  1 via `document.elementFromPoint`, then `mouseup`; assert `api.setState` was called again during
  the drag (line selection extended, not char-wise).

## Out of scope

- Any change to double-click word selection (`e.detail === 2` path, untouched).
- Any change to the gutter click/drag line-selection path (reused as-is, not modified).
- Native browser triple-click text selection outside the editor's own DOM (already suppressed via
  the existing `e.preventDefault()` earlier in `onMouseDown` for any hit inside `.editor-body`).

## Verification

- Run `./scripts/run.mjs check-diff` after the change and after the tests.
- Manual check: open the editor tab, triple-click a line of text, confirm the whole line is
  selected (matching gutter-click behavior), and confirm dragging after the triple click extends
  the selection line-wise rather than character-wise.
