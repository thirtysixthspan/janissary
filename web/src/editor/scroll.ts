// Viewport adjustments that keep wrapped-line vertical navigation working at the edges of the
// editor body. Wrapping is a CSS concern, so the only way to find the screen row next to the caret
// is to hit-test a point on it (see mouse.ts) — and the browser cannot hit-test a row it is not
// painting. Scrolling that row into view first is what makes ↑/↓ at the edge advance one screen
// row rather than a whole soft-wrapped buffer line.

// The point visualVerticalHit probes: half a line-height beyond the caret's box.
function probeY(rect: DOMRect, dir: 'up' | 'down'): number {
  return dir === 'up' ? rect.top - rect.height / 2 : rect.bottom + rect.height / 2;
}

// Whether the probe point clears both edges of the body's visible box by half a caret box. Being
// merely inside that box is not enough: a screen row is taller than the caret's inline box and the
// body's height is not a whole number of rows, so the row past the caret is routinely painted as a
// sliver a few pixels tall at the edge of the scrollport. A probe point landing in that sliver sits
// against the body's own border, where the hit test resolves the body rather than a row and the
// press degrades to a whole buffer line. Requiring clearance keeps the point on a painted row.
function probeIsClear(body: HTMLElement, rect: DOMRect, dir: 'up' | 'down'): boolean {
  const view = body.getBoundingClientRect();
  const y = probeY(rect, dir);
  const clearance = rect.height / 2;
  return y >= view.top + clearance && y <= view.bottom - clearance;
}

// Scroll the body just enough that the screen row the caret would move onto is painted with room
// to spare, so the probe can resolve it. Does nothing in the common case (the row is well within
// the view) and nothing when the caret has no real layout — a zero-height rect, as in jsdom. One
// nudge always suffices: scrollIntoView has put the caret's own box inside the body, so scrolling
// by a caret box moves the probe point a caret box clear of the edge. When the body has already
// scrolled as far as it can, the probe stays where it is and visualVerticalHit — which still
// accepts any point inside the body — falls back to the logical line at the document's edges.
export function revealVerticalProbe(body: HTMLElement, caret: HTMLElement, dir: 'up' | 'down'): void {
  const rect = caret.getBoundingClientRect();
  if (rect.height === 0 || probeIsClear(body, rect, dir)) return;
  // The caret may be off-screen entirely (the view was scrolled away with the wheel); bring it back
  // to the nearest edge before deciding whether a further nudge is needed.
  caret.scrollIntoView({ block: 'nearest' });
  const revealed = caret.getBoundingClientRect();
  if (probeIsClear(body, revealed, dir)) return;
  body.scrollTop += dir === 'up' ? -revealed.height : revealed.height;
}
