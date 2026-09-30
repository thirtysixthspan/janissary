// Keeping the highlighted row on screen as the keys move it.
//
// The table's header is sticky, so it sits over the top of the frame the rows scroll in. The
// browser's own `scrollIntoView({ block: 'nearest' })` stops once a row's top meets the frame's top —
// which is behind the header — so walking up to the first row left it hidden there and the frame
// scrolled by one header's height. The scroll is worked out here against the band under the header.

/** A vertical span in client coordinates. */
export interface Span {
  top: number;
  bottom: number;
}

/**
 * The scroll offset that brings `row` into `view` — the band between the bottom of the sticky header
 * and the bottom of the frame — or null when it is already there, which is when `nearest` would not
 * have moved either. A row taller than the band shows its top.
 */
export function revealScrollTop(view: Span & { scrollTop: number }, row: Span): number | null {
  if (row.top < view.top) return Math.max(0, view.scrollTop - (view.top - row.top));
  if (row.bottom > view.bottom) {
    const below = row.bottom - view.bottom;
    const room = row.top - view.top;
    return view.scrollTop + Math.min(below, room);
  }
  return null;
}

/**
 * Scroll `frame` so `row` is in view below the header. The first row is the top of the table, so it
 * takes the frame back to zero outright rather than trusting the arithmetic to land on it to the
 * pixel. Only the vertical scroll moves: the row is as wide as the table, and a horizontal nudge to
 * its nearest edge is nothing the user asked for.
 */
export function revealRow(frame: HTMLElement, row: Element, first: boolean): void {
  if (first) {
    frame.scrollTop = 0;
    return;
  }
  const top = frame.getBoundingClientRect().top + frame.clientTop;
  // The header is measured each time, because the filter row opens inside it.
  const header = frame.querySelector('thead')?.getBoundingClientRect().height ?? 0;
  const next = revealScrollTop(
    { top: top + header, bottom: top + frame.clientHeight, scrollTop: frame.scrollTop },
    row.getBoundingClientRect(),
  );
  if (next !== null) frame.scrollTop = next;
}
