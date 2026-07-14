# Editor wrapped-line vertical navigation

**Complexity: 5/10** — a new DOM-geometry helper reusing the existing mouse-hit-testing
utilities, plus a plumbed-through optional resolver in the move pipeline; no new files beyond
one small addition to an already-DOM-aware module, and every existing pure movement path stays
untouched and covered by its existing tests.

## Goal

In the file editor, when a logical line is long enough to soft-wrap across several visual rows,
pressing ArrowUp/ArrowDown (or Ctrl+P/Ctrl+N) should move the caret to the adjacent *visual* row
first — the same row-by-row behavior every text editor gives wrapped text — rather than jumping
straight to the previous/next *logical* line as it does today. Once the caret reaches the top or
bottom visual row of a wrapped line, the next Up/Down press continues into the neighboring
logical line, same as for unwrapped lines.

## Background

`web/src/editor/motion.ts`'s `moveCursor` computes vertical movement purely from the logical
`EditorState.lines` array (`s.cursor.line - 1` / `+ 1`), with no awareness of how a line is
soft-wrapped on screen — wrapping is entirely a CSS concern (`.editor-content` uses
`white-space: pre-wrap; word-break: break-all` in `web/src/index.css`). `web/src/editor/keys.ts`
maps ArrowUp/ArrowDown (and Ctrl+P/Ctrl+N in `ctrlAction`) to `{ kind: 'move', dir: 'up' | 'down',
extend }`, which `useEditor.ts`'s `apply()` sends straight to `moveCursor`.

The editor already has DOM-geometry line/column resolution for mouse clicks in
`web/src/editor/mouse.ts`: `hitFromPoint(body, x, y)` resolves a screen point to
`{ line, col, inGutter }` using `elementFromPoint`/`caretPositionFromPoint`, with graceful
clamping to the first/last row when the point falls outside any row. That utility is exactly
what's needed to resolve "one visual row up/down from the caret's current screen position" — the
same DOM point-to-position machinery, just with a computed point instead of a mouse coordinate.

`web/src/editor/render.tsx`'s caret is a real DOM node (`<span class="editor-caret">`, tracked via
`caretRef` in `web/src/EditorTab.tsx`), and its `getBoundingClientRect()` gives a reliable pixel
box in a real browser — `render.tsx` already relies on this span establishing a non-zero line-box
height (including a zero-width-space hack for empty lines) for exactly this kind of geometry to
work. In `jsdom` (the test environment), `getBoundingClientRect()` always returns an all-zero
rect, since `jsdom` performs no layout — so a resolver that bails out on a zero-height rect
naturally falls back to today's pure logical-line behavior in every existing test, with no risk of
silently changing their assertions.

## Approach

Add a DOM-geometry resolver, analogous to `hitFromPoint`, that measures the caret's current
bounding box and probes one line-height above/below it:

- `visualVerticalHit(body, caret, dir)` in `mouse.ts`: reads `caret.getBoundingClientRect()`;
  returns `null` when the rect has zero height (unmounted or non-layout environment — the `jsdom`
  case); otherwise computes a point one half-line-height above (`dir: 'up'`) or below
  (`dir: 'down'`) the caret's box and resolves it via the existing `hitFromPoint(body, x, y)`.

Thread that resolver through the existing move pipeline as an *optional* capability, so every
other action and every existing test (none of which pass it) is unaffected:

- `useEditor.ts`'s `apply()` gains an optional fourth parameter, `resolveVertical`. For `'move'`
  actions whose `dir` is `'up'`/`'down'`, it calls `resolveVertical(dir)` first; a non-null result
  is applied via a new `motion.ts` export, `moveToVisualTarget(s, pos, extend)` (a thin wrapper
  around the existing internal `moveTo` used by every other movement transition, so selection
  extension/anchor semantics stay identical). A `null`/absent result falls back to today's
  `moveCursor(s, dir, extend)` — unchanged logical-line movement.
- `EditorTab.tsx` builds `resolveVertical` from its existing `bodyRef`/`caretRef` and passes it
  into `api.apply(action, pageLines(), resolveVertical)`.

Because `visualVerticalHit` reuses `hitFromPoint`'s existing clamping (a point above the first row
clamps to line 0 col 0; a point below the last row clamps to the last line's end), crossing out of
a wrapped line's top/bottom visual row into the neighboring logical line, and crossing past the
document's first/last line, both fall out of the same geometry-based resolution automatically —
no separate "did we leave the logical line" branch is needed.

Font is monospace (`--mono` in `index.css`) with `line-height: 1.45`, so this also subsumes plain
(unwrapped) vertical movement with no behavior change for the common case: a screen point directly
above/below the caret in a monospace grid resolves to the same column the old `goalCol`-based
logic picked, without needing to carry `goalCol` through the DOM-resolved path.

## Implementation steps

1. **`web/src/editor/mouse.ts`** — add and export `visualVerticalHit(body: HTMLElement, caret: HTMLElement, dir: 'up' | 'down'): MouseHit | null`, using `caret.getBoundingClientRect()` and the existing `hitFromPoint`.
2. **`web/src/editor/motion.ts`** — export `moveToVisualTarget(s: EditorState, pos: Pos, extend: boolean): EditorState`, delegating to the existing internal `moveTo`.
3. **`web/src/editor/useEditor.ts`** — extend `EditorApi['apply']`'s signature with the optional `resolveVertical` parameter; in the `'move'` case, branch on `dir === 'up' || dir === 'down'` and try `resolveVertical` before falling back to `moveCursor`.
4. **`web/src/EditorTab.tsx`** — add a `resolveVertical` function next to the existing `pageLines()` helper, using `bodyRef`/`caretRef` and `visualVerticalHit`; pass it as the fourth argument to `api.apply`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/editor/mouse.test.ts`: add a `describe('visualVerticalHit', ...)` block —
  - returns `null` when `getBoundingClientRect()` reports zero height (the default/`jsdom` case, no mocking needed).
  - with a mocked non-zero rect and mocked `document.elementFromPoint`/`caretPositionFromPoint` (mirroring the existing `pointToCol`/`hitFromEvent` test patterns), returns the `{ line, col }` resolved at the probed point for both `'up'` and `'down'`.
- `web/src/editor/model.test.ts` (where `motion.ts` is already exercised): add a case for `moveToVisualTarget` — moves the cursor to the given position, clamps out-of-range positions via the existing `clampPos` path, and sets/clears the anchor per the `extend` flag exactly like the other motion transitions.
- `web/src/editor/useEditor.test.ts`: extend the `./motion` mock with `moveToVisualTarget`, then add cases —
  - `apply({ kind: 'move', dir: 'down', extend: false }, 20, resolveVertical)` where `resolveVertical` returns a position calls `moveToVisualTarget` and not `moveCursor`.
  - the same call with a `resolveVertical` that returns `null` falls back to `moveCursor`.
  - `apply({ kind: 'move', dir: 'left', extend: false }, 20, resolveVertical)` never calls `resolveVertical` (only up/down are visual).
- `web/src/EditorTab.test.tsx`: add a case that mocks `caretRef`'s element geometry (`getBoundingClientRect`) plus `document.elementFromPoint`/`caretPositionFromPoint` so a wrapped-line ArrowDown press resolves to a visual row within the same logical line, asserting the gutter/current-row line number is unchanged while the column moves — mirroring the existing DOM-mocking style already used for click/selection behavior in `useEditorMouse`-driven tests.

## Out of scope

- PageUp/PageDown (`movePage`) — unaffected; paging already jumps a viewport's worth of logical lines and the issue only reports arrow-key behavior.
- Horizontal movement (`ArrowLeft`/`ArrowRight`) — already visually correct, since horizontal motion is character-by-character regardless of wrapping.
- Any change to how lines are wrapped (CSS) or measured for `pageLines()` — the existing line-height-based viewport calculation is untouched.
- Non-monospace fonts / variable line-height — the editor is monospace-only today; no accommodation needed for proportional fonts.

## Verification

`./scripts/run.mjs check-diff` must pass clean. Manual: not verifiable in this environment (no
real browser layout engine); the tests above exercise the DOM-geometry resolution path directly
via mocked `getBoundingClientRect`/`elementFromPoint`/`caretPositionFromPoint`, and the fallback
path is exercised by the many existing tests that call `apply()`/press arrow keys without any such
mocking.
