// Viewport adjustments that keep wrapped-line vertical navigation working at the edges of the
// editor body. Wrapping is a CSS concern, so the only way to find the screen row next to the caret
// is to hit-test a point on it (see mouse.ts) — and the browser cannot hit-test a row it is not
// painting. Scrolling that row into view first is what makes ↑/↓ at the edge advance one screen
// row rather than a whole soft-wrapped buffer line.
//
// Everything here is measured in screen rows (see screen-rows.ts), never in caret boxes. A caret
// box is shorter than the row it sits on, so a view scrolled by caret boxes falls behind a caret
// moving by rows, and a clearance stated in caret boxes is satisfied while the row the probe lands
// on is still partly unpainted at the edge.

import { caretRowBox, probePoint, screenRowHeight, scrollport } from './screen-rows';

// Scroll the body so the whole screen row the caret is on is inside the scrollport — not merely the
// caret's own box, which is what `scrollIntoView({ block: 'nearest' })` bounds and which leaves the
// row it sits on clipped by the line box's leading at whichever edge it came from. Called after
// every cursor move, so the line the caret is on can never end up off the page, however the press
// resolved. Does nothing when the caret has no real layout — a zero-height rect, as in jsdom.
export function keepCaretRowVisible(body: HTMLElement, caret: HTMLElement): void {
  // The caret may be far outside the view (the view was scrolled away with the wheel) or inside a
  // scrollable ancestor of the body; bring it back the browser's way first, then correct the
  // remaining overhang of its row against the body's own scroll position.
  caret.scrollIntoView({ block: 'nearest' });
  const rect = caret.getBoundingClientRect();
  if (rect.height === 0) return;
  const row = caretRowBox(body, rect);
  const port = scrollport(body);
  if (row.bottom > port.bottom) body.scrollTop += row.bottom - port.bottom;
  else if (row.top < port.top) body.scrollTop -= port.top - row.top;
}

// Whether the row the probe point lands on is painted in full: the point sits at that row's centre,
// so clearing the near edge of the scrollport by half a row is the same as asking for the whole row.
// Being merely inside the body is not enough — the body's height is not a whole number of rows, so
// the row past the caret is routinely painted as a sliver at the edge of the scrollport, and a probe
// point in that sliver sits against the body's own border where the hit test resolves the body
// rather than a row and the press degrades to a whole buffer line.
function probeIsClear(body: HTMLElement, rect: DOMRect, dir: 'up' | 'down'): boolean {
  const port = scrollport(body);
  const y = probePoint(body, rect, dir);
  const clearance = screenRowHeight(body, rect.height) / 2;
  return y >= port.top + clearance && y <= port.bottom - clearance;
}

// Scroll the body just enough that the screen row the caret would move onto is painted in full, so
// the probe can resolve it. Does nothing in the common case (the row is well within the view) and
// nothing when the caret has no real layout. One nudge always suffices: putting the caret's own row
// fully in view leaves its bottom edge inside the scrollport, so scrolling by a row leaves it a full
// row clear of the edge, which is the clearance being asked for. When the body has already scrolled
// as far as it can, the probe stays where it is and visualVerticalHit falls back to the logical line
// at the document's edges.
export function revealVerticalProbe(body: HTMLElement, caret: HTMLElement, dir: 'up' | 'down'): void {
  const rect = caret.getBoundingClientRect();
  if (rect.height === 0 || probeIsClear(body, rect, dir)) return;
  keepCaretRowVisible(body, caret);
  const revealed = caret.getBoundingClientRect();
  if (probeIsClear(body, revealed, dir)) return;
  const row = screenRowHeight(body, revealed.height);
  body.scrollTop += dir === 'up' ? -row : row;
}
