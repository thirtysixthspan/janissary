// Viewport adjustments that keep wrapped-line vertical navigation working at the edges of the
// editor body. Wrapping is a CSS concern, so the only way to find the screen row next to the caret
// is to hit-test a point on it (see mouse.ts) — and the browser cannot hit-test a row it is not
// painting. Scrolling that row into view first is what makes ↑/↓ at the edge advance one screen
// row rather than a whole soft-wrapped buffer line.

// The point visualVerticalHit probes: half a line-height beyond the caret's box.
function probeY(rect: DOMRect, dir: 'up' | 'down'): number {
  return dir === 'up' ? rect.top - rect.height / 2 : rect.bottom + rect.height / 2;
}

function probeOutsideBody(body: HTMLElement, rect: DOMRect, dir: 'up' | 'down'): boolean {
  const view = body.getBoundingClientRect();
  const y = probeY(rect, dir);
  return y < view.top || y > view.bottom;
}

// Scroll the body just enough that the screen row the caret would move onto is painted, so the
// probe can resolve it. Does nothing in the common case (the row is already on screen) and nothing
// when the caret has no real layout — a zero-height rect, as in jsdom. When the body has already
// scrolled as far as it can, the probe stays unreachable and visualVerticalHit keeps returning
// null, leaving the logical-line fallback in place.
export function revealVerticalProbe(body: HTMLElement, caret: HTMLElement, dir: 'up' | 'down'): void {
  const rect = caret.getBoundingClientRect();
  if (rect.height === 0 || !probeOutsideBody(body, rect, dir)) return;
  // The caret may be off-screen entirely (the view was scrolled away with the wheel); bring it back
  // to the nearest edge before deciding whether a further nudge is needed.
  caret.scrollIntoView({ block: 'nearest' });
  const revealed = caret.getBoundingClientRect();
  if (!probeOutsideBody(body, revealed, dir)) return;
  body.scrollTop += dir === 'up' ? -revealed.height : revealed.height;
}
