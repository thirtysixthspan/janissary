# Scroll the editor by screen lines, not buffer lines, at the edges of the view

**Complexity: 4/10** — one new small pure-ish DOM helper module plus a two-line change in the caller; the wrapped-line navigation machinery, the movement transitions, and the caret-into-view effect all stay as they are. It closes an item the earlier arrow-key fix explicitly deferred.

## Goal

Pressing ↑/↓ while the caret sits on the first or last visible row of an editor tab — or after the view has been scrolled away from the caret with the mouse wheel — should advance the cursor by one *screen* row and scroll the body by that same one screen row. Today it advances by a whole *buffer* line in that situation, so a soft-wrapped line that occupies several screen rows is crossed in a single press and the view lurches by the whole wrapped line instead of scrolling smoothly.

## Background (verified)

- Soft wrapping is pure CSS (`web/src/theme.css` — `.editor-content { white-space: pre-wrap; overflow-wrap: break-word; }` inside `.editor-row`, one flex row per buffer line), so a buffer line can occupy many screen rows while the editor's state model only knows logical `(line, col)` positions.
- Wrapped-line-aware ↑/↓ is resolved by DOM geometry: `EditorTab.tsx`'s `resolveVertical` calls `visualVerticalHit(body, caret, dir)` in `web/src/editor/mouse.ts`, which probes a point half a line-height above/below the caret's box and hit-tests it exactly like a mouse click. A non-null hit becomes `moveToVisualTarget`; a null hit falls back to logical one-buffer-line `moveCursor`.
- `visualVerticalHit` returns null whenever the probe point falls outside `body.getBoundingClientRect()`. That guard exists because `document.elementFromPoint` cannot see a row the browser is not painting — without it the probe clamped to the first/last row and teleported the cursor to the document edge (`product/plans/complete/editor-arrow-offscreen-caret-jump.md`).
- The consequence is exactly the reported issue, and that plan lists it as knowingly deferred: "Preserving one-visual-row granularity on wrapped lines when the caret is exactly at the screen edge (degrades to logical-line movement for that single press)." Since the caret is pinned to the edge for as long as the user keeps pressing ↓, that "single press" is in practice *every* press once the view starts scrolling.
- Nothing else in the editor scrolls by buffer lines: there is no `scrollTop` model at all, the mouse wheel is the browser's own pixel scrolling, and the caret is brought back with `caretRef.current.scrollIntoView({ block: 'nearest' })` on the caret span — a zero-width inline span whose box is one screen row, so that call is already screen-row granular.

## Correct behavior

The probe point being unreachable is a scroll-position problem, not a "there is no row there" problem. Before probing, scroll the body just enough that the neighbouring screen row is painted: bring an off-screen caret back to the nearest edge, then, if the probe still falls outside, nudge the body by exactly one row height in the direction of travel. The probe then resolves the adjacent screen row normally, so ↑/↓ at the edge moves one screen row and the view has scrolled one screen row — never a whole wrapped buffer line. When the body cannot scroll any further (already at the top or bottom of the document) the probe stays unreachable, `visualVerticalHit` still returns null, and the existing logical fallback keeps working unchanged.

## Approach

Add `web/src/editor/scroll.ts` exporting `revealVerticalProbe(body, caret, dir)`, and call it from `EditorTab.tsx`'s `resolveVertical` immediately before `visualVerticalHit`. Keeping it separate from `mouse.ts` keeps that module what its header says it is — a point → `(line, col)` mapping with no side effects — and keeps `visualVerticalHit` a pure query that still returns null when the row genuinely cannot be reached.

`revealVerticalProbe` does nothing at all unless it has to: it returns immediately when the caret has no layout (a zero-height rect, i.e. jsdom) or when the probe point already lies inside the body's visible box, which is the overwhelmingly common case. Only at the edges does it scroll, and it scrolls at most one row beyond whatever `scrollIntoView({ block: 'nearest' })` already did. The caret-into-view effect in `EditorTab.tsx` then finds the caret already visible and is a no-op, so the net movement is one screen row of scrolling per press.

## Implementation steps

1. **`web/src/editor/scroll.ts`** (new) — `revealVerticalProbe(body: HTMLElement, caret: HTMLElement, dir: 'up' | 'down'): void`, with two module-local helpers mirroring `visualVerticalHit`'s geometry so the two agree on where the probe point is: the probe `y` for a caret rect and a direction, and whether that `y` lies outside the body's visible box. The function reads the caret rect, returns on a zero-height rect or an in-view probe, calls `caret.scrollIntoView({ block: 'nearest' })`, re-reads the rect, returns if the probe is now in view, and otherwise adds (or subtracts) one caret-rect height to `body.scrollTop`.
2. **`web/src/editor/EditorTab.tsx`** — import `revealVerticalProbe` and call it in `resolveVertical` between the null guard and `visualVerticalHit`; update the helper's comment to say the fallback is now only for a genuinely unreachable row (no layout, or nothing left to scroll).
3. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- **`web/src/editor/scroll.test.ts`** (new), mirroring the rect-mocking style of `mouse.test.ts`'s `visualVerticalHit` block:
  - does nothing when the caret has no layout (zero-height rect).
  - does not scroll when the probe point already lies inside the body's visible box, for both directions.
  - scrolls the body down by one row height when the caret sits on the last visible row and the direction is down.
  - scrolls the body up by one row height when the caret sits on the first visible row and the direction is up.
  - calls `scrollIntoView({ block: 'nearest' })` first for a caret scrolled entirely out of view, and does not nudge `scrollTop` when that alone brings the probe point back in view.
- **`web/src/editor/EditorTab.test.tsx`** — an ArrowDown press with the caret mocked onto the last visible row of a mocked body box, where the caret rect tracks `body.scrollTop` so the nudge really moves it, and the point hit-test resolves back into the *first* buffer line (a wrapped continuation row). Asserts the current row is still `line one` — a logical fallback would have moved to `line two` — and that `body.scrollTop` advanced by exactly one row height.

## Spec and documentation

- **`product/specs/editor-tab.md` → Scrolling** — the paragraph beginning "Keyboard cursor movement keeps this scrolling smooth at the edges of the view" currently promises "moves the cursor a single line"; restate it as a single screen row, and say the view scrolls by that same screen row, so a wrapped line is crossed a row at a time at the edge exactly as it is in the middle of the view.
- **`documentation/user-documentation/tab-types/editor.md`** — the "Caret and scroll" paragraph makes the same "exactly one line" promise; update it to one visual row for consistency with the wrapping paragraph directly above it.

## Verification

`./scripts/run.mjs check-diff` passes clean. Manual (browser): open a file containing a paragraph long enough to wrap over several rows, put the caret in it, and hold ↓ — the view scrolls one screen row per press with the caret pinned at the bottom edge, instead of jumping a whole wrapped paragraph at a time; the same holds for ↑ at the top edge, and for ↓ after scrolling the caret off-screen with the wheel.

## Out of scope

- **PageUp/PageDown.** `pageLines()` still computes a viewport's worth of *buffer* lines, so paging through wrapped text still moves further than one screen. Making paging screen-row-aware needs a different mechanism (a viewport-sized probe, or a real visual-row model) and carries its own regression risk; the reported issue is about the cursor/scroll advancing a whole buffer line at a time, which is the arrow-key path. Recorded as a separate follow-up rather than folded in here.
- Multi-caret ↑/↓, which deliberately moves every caret by a whole buffer line (see the spec's "Multiple selections").
- `hitFromPoint`'s clamp fallback for mouse drags, and `visualVerticalHit`'s own null contract — both unchanged.
- Any change to how lines wrap, to the caret-into-view effect, or to transcript scrolling.
