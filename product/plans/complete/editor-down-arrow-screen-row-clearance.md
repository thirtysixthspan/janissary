# Make ↓ at the bottom edge scroll by a screen row, like ↑ already does

**Complexity: 3/10** — a clearance requirement added to the existing `revealVerticalProbe` helper, no new modules, no change to the movement transitions, the hit-test contract, or the caret-into-view effect. Tests and a spec sentence follow it.

## Goal

`product/backlog/issues.md`: *"scroll down in the editor tab should be by screen line and not buffer line. This issue was addressed and works for scroll up, but not scroll down."* — the follow-up to commit `4f63257e` (`product/plans/complete/editor-edge-screen-line-scrolling.md`), which made ↑/↓ at the edges of the view advance a screen row instead of a whole buffer line. Holding ↑ now scrolls a row per press; holding ↓ still crosses a soft-wrapped paragraph in one press. Pressing ↓ at the bottom edge must behave exactly like ↑ at the top edge.

## Background (verified)

- Wrapped-line-aware ↑/↓ is resolved by DOM geometry. `useEditorInteractions.ts`'s `verticalResolver` calls `revealVerticalProbe(body, caret, dir)` (`web/src/editor/scroll.ts`) and then `visualVerticalHit(body, caret, dir)` (`web/src/editor/mouse.ts`), which probes a point half a caret-box beyond the caret and hit-tests it with `document.elementFromPoint` exactly like a mouse click. A hit becomes `moveToVisualTarget`; a null hit falls back to whole-buffer-line `moveCursor` — the reported symptom.
- `visualVerticalHit` returns null when the probe point falls outside `body.getBoundingClientRect()`, because the browser cannot hit-test a row it is not painting. `revealVerticalProbe` exists to scroll that row into view first: it brings an off-screen caret back with `scrollIntoView({ block: 'nearest' })` and, if the probe still falls outside, nudges `body.scrollTop` by one caret-box height.
- Both helpers treat "inside the body's box" as good enough. It is not. A screen row is `line-height: 1.45` tall (`.editor-row` in `web/src/theme.css`) while the caret's inline box is only the font's content height, and the editor body's height is not a whole number of rows — so the row past the caret is routinely painted as a thin sliver at the edge of the scrollport. When the probe point falls in that sliver it is "inside the body" and no reveal happens, and the hit-test then runs a pixel or two from the body's own bottom border, on the part of a row the browser is only partly painting. `elementFromPoint` there resolves the body itself rather than a row, `hitFromEvent` finds no `[data-editor-line]` ancestor and returns null, and the press degrades to a whole buffer line.
- The window of sliver heights that produces this is a few pixels wide at each edge, and which edge lands in it depends on where `scrollIntoView({ block: 'nearest' })` leaves the caret — flush against the bottom border after a downward move, flush against the top border after an upward one. That is why the same code path is reliable going up and unreliable going down.
- Nothing else in the editor scrolls by buffer lines: there is no `scrollTop` model, the wheel is the browser's own pixel scrolling, and the caret is brought back with `scrollIntoView({ block: 'nearest' })` on the caret span.

## Correct behavior

The probe point must land on a row the browser is actually painting, not merely inside the body's box. Before probing, require it to clear the near edge of the body by half a caret box; when it does not, scroll by one row exactly as the helper already does for a probe point that falls outside altogether. The probe then resolves the adjacent screen row in either direction, so ↑ and ↓ at the edges both move one screen row and scroll by one screen row.

The nudge is enough on its own: `scrollIntoView({ block: 'nearest' })` has already brought the caret's own box inside the body, so one caret-box scroll moves the probe point a full caret box away from the edge, which is the clearance being asked for. When the body cannot scroll any further, the scroll is a no-op, `visualVerticalHit` keeps its unchanged in-the-body guard, and the existing logical-line fallback still applies at the top and bottom of the document.

Per-press scrolling stays at one screen row. The reveal scrolls at most one caret box, the caret-into-view effect in `EditorTab.tsx` then contributes the remainder of the row it moved onto, and their sum is never more than a row.

## Approach

Change `web/src/editor/scroll.ts` only. Replace the module-local `probeOutsideBody` with a clearance test — the probe point must sit at least half a caret box inside the body's visible box — and use it for both the pre-`scrollIntoView` check and the post-`scrollIntoView` check. The nudge, the zero-height (no layout) guard, the direction handling, and the exported signature all stay as they are, so `useEditorInteractions.ts` and `mouse.ts` need no change and `visualVerticalHit`'s null contract is untouched.

Keeping the clearance in the reveal rather than in `visualVerticalHit` matters: the reveal is the part that is allowed to move the view, and the hit test stays a pure query that still answers for any probe point inside the body — including the ones near an edge that the body has no room left to improve.

## Implementation steps

1. **`web/src/editor/scroll.ts`** — rename `probeOutsideBody` to `probeIsClear` (returning whether the probe point clears both edges by half the caret rect's height), invert its two call sites, and update the module comment to say why "painted" needs clearance rather than mere containment.
2. Run `./scripts/run.mjs check-diff`.

## Tests

- **`web/src/editor/scroll.test.ts`** (extend; existing six cases stay as they are and must keep passing):
  - down: a caret whose probe point lands exactly on the body's bottom border — inside the box, on the sliver of the row below — scrolls one caret height instead of leaving `scrollTop` alone.
  - up: the mirror case at the top border scrolls one caret height in the other direction.
  - down: a probe point that already clears the bottom border by more than half a caret box does not scroll.
- **`web/src/editor/EditorTab.test.tsx`** — an ArrowDown press with the caret mocked one row above the bottom edge, so the row it would move onto is painted only as a sliver: the caret rect tracks `body.scrollTop` as it does in a browser, and the point hit-test resolves back into the first buffer line (a wrapped continuation row). Asserts the current row is still `line one` and that `body.scrollTop` advanced by one row — under the old clearance-free check it stayed at `0`.

## Spec and documentation

- **`product/specs/editor-tab.md` → Scrolling** — the paragraph beginning "Keyboard cursor movement keeps this scrolling smooth at the edges of the view" describes the intended behavior already; add that a row only partly visible at the edge is scrolled into place before the press resolves, so ↓ at the bottom behaves the same as ↑ at the top.
- **`documentation/user-documentation/tab-types/editor.md`** — the "Caret and scroll" paragraph already promises one visual row per press in both directions, and that promise does not change. No edit.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual (browser): open a file with a paragraph long enough to wrap over several rows, put the caret in it, and hold ↓ — the view scrolls one screen row per press with the caret pinned at the bottom edge, rather than jumping a whole wrapped paragraph; ↑ at the top edge is unchanged; both still fall back to a whole line at the very top and bottom of the document.

## Out of scope

- **PageUp/PageDown**, which still move a viewport's worth of buffer lines (recorded as out of scope by the previous plan and stated in the spec).
- `visualVerticalHit`'s own in-the-body guard and `hitFromPoint`'s clamp fallback for mouse drags — both unchanged, so an unreachable row still degrades to logical-line movement exactly as before.
- Multi-caret ↑/↓, which deliberately moves every caret by a whole buffer line.
- Any change to how lines wrap, to the caret-into-view effect, or to transcript scrolling.
