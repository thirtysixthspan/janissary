# Fix editor ↑/↓ jumping to the document edge instead of scrolling when the caret leaves the screen

**Complexity: 3/10** — the root cause is one geometry guard missing from a single pure function
(`visualVerticalHit`); the fix extends the function's already-documented null-fallback contract
and is fully unit-testable with the mocking style `mouse.test.ts` already uses.

## Goal

Moving the cursor up or down with the keyboard in an editor tab should always advance the cursor
one row and scroll the tab so the caret stays visible. Today, once the caret sits at the visible
edge of the editor body — or has been scrolled off-screen entirely (e.g. with the mouse wheel) —
the next ↑/↓ press teleports the cursor to line 0 or to the very end of the document instead of
moving one row, so the view jumps wildly rather than scrolling smoothly.

## Background (verified)

- `web/src/EditorTab.tsx` resolves plain ArrowUp/ArrowDown through `resolveVertical`, which calls
  `visualVerticalHit(body, caret, dir)` (`web/src/editor/mouse.ts`) to make wrapped lines move one
  *visual* row at a time. `useEditor.apply` falls back to logical one-line `moveCursor` movement
  whenever `resolveVertical` returns null — that fallback is the documented contract for "no real
  layout" (jsdom).
- `visualVerticalHit` probes a viewport point half a line-height above/below the caret's
  `getBoundingClientRect` box and resolves it with `hitFromPoint`, which uses
  `document.elementFromPoint`. Per CSSOM, `elementFromPoint` returns null for any point outside
  the viewport, and for a point inside the viewport but outside the editor body it returns some
  other element (the metadata header, whatever sits below the tab).
- When that happens, `hitFromPoint` falls into its clamp fallback — written for mouse *drags* that
  leave the body — which compares the probe point against the **first DOM row's** rect. In a
  scrolled document that row's top is far above the viewport, so almost every off-screen probe
  clamps to `{ line: lastLine, col: MAX_SAFE_INTEGER }` (or line 0 near the top of the document).
  The cursor teleports, and the caret-into-view scroll effect then slams the view to the document
  edge.
- Reproduction (regression tests, `web/src/editor/mouse.test.ts`, `visualVerticalHit` describe
  block): mock the body rect as the visible scrollport (top 20 / bottom 120), place the caret rect
  off-screen above (top −36) or at the bottom edge (bottom 120), mock `elementFromPoint` to return
  null (or an element outside the body). Before the fix all three tests fail with
  `{ line: 2, col: 9007199254740991 }` — the last-line clamp — where null (logical fallback) is
  expected.
- `product/specs/editor-tab.md` → Scrolling: "After any cursor movement (typing, arrow keys, mouse
  click, page up/down), the caret is scrolled into view to ensure it remains visible." The clamp
  behavior contradicts this — the cursor position itself is destroyed, not just the scroll.

## Correct behavior

When the ↑/↓ probe point falls outside the editor body's visible box, the visual hit test cannot
see the target row, so it must return null and let the caller fall back to logical one-line
movement; the existing cursor-moved effect then scrolls the caret back into view. The cursor never
jumps to the document start/end from an arrow press.

## Approach

Add a scrollport guard to `visualVerticalHit`: after computing the probe `y`, compare it against
`body.getBoundingClientRect()`; if the probe point lies above the body's top or below its bottom,
return null. This covers both failure modes (caret fully off-screen, and caret on the first/last
visible row probing past the edge) without touching `hitFromPoint`, whose clamp fallback remains
correct for its original mouse-drag use.

On a soft-wrapped line at the very screen edge this degrades to logical-line movement for that one
press (a whole logical line instead of one visual row); the caret is scrolled back into view by the
effect, so subsequent presses use the visual path again. That is the same degradation the function
already accepts for layoutless environments and is strictly better than teleporting.

## Implementation

1. **`web/src/editor/mouse.ts`** — in `visualVerticalHit`, after computing `y`, read
   `body.getBoundingClientRect()` and return null when `y < view.top || y > view.bottom`. Extend
   the function's comment to name the second null condition (probe point outside the body's
   visible box).
2. **`web/src/editor/mouse.test.ts`** — the three new regression tests (written first, currently
   failing) assert null for: caret scrolled off-screen above the body (both directions), probe
   point below the visible body, probe point above the visible body resolving to a header element.
   The two existing happy-path tests gain a mocked body rect that contains their probe points, so
   they keep exercising the resolved-hit path under the new guard.

## Tests

- `web/src/editor/mouse.test.ts` → `visualVerticalHit`:
  - `returns null instead of clamping when the caret is scrolled out of view above the body`
  - `returns null instead of clamping when the probe point falls below the visible body`
  - `returns null instead of clamping when the probe point falls above the visible body`
  - existing `resolves a point one line-height below/above the caret` tests updated with an
    in-view body rect, proving the guard does not break normal wrapped-line navigation.

## Verification

`./scripts/run.mjs check-diff` passes clean, including the three regression tests that fail
without the guard. Manual (browser): open a long file in an editor tab, scroll the view away from
the caret with the mouse wheel, press ↓ — the cursor moves one line from where it was and the view
scrolls back to it; hold ↓ past the bottom of the screen — the view scrolls line by line with the
caret pinned at the edge, never jumping to the end of the file. Not runnable in this environment —
noted as unverified manually if so.

## Out of scope

- `hitFromPoint`'s clamp fallback for mouse drags — intentionally unchanged.
- Preserving one-visual-row granularity on wrapped lines when the caret is exactly at the screen
  edge (degrades to logical-line movement for that single press).
- Any change to PageUp/PageDown, Home/End, or transcript scrolling.
