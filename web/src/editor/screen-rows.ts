// Screen-row geometry for the editor body. Vertical navigation and edge scrolling are both stated
// in screen rows — the rows the browser actually paints, one per visual line of a soft-wrapped
// buffer line — but the only element either of them can measure is the caret, a zero-width inline
// span whose box is the font's content height rather than a whole row. Growing that box to a row,
// in one place, is what keeps "one row" meaning the same thing to the reveal helper (scroll.ts) and
// to the hit-test probe (mouse.ts).

type Band = { top: number; bottom: number };

// The height of one screen row: the body's computed line-height, which every row is exactly one of
// (`.editor-row { min-height: 1.45em }` under `.editor-body { line-height: 1.45 }`). Falls back to
// the caret's own box when the computed value is not a length — `normal`, or a non-layout
// environment like jsdom — which leaves every caller measuring in caret boxes as it did before.
export function screenRowHeight(body: HTMLElement, fallback: number): number {
  const lineHeight = Number(getComputedStyle(body).lineHeight.replace('px', ''));
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fallback;
}

// The screen row the caret sits on: its inline box grown symmetrically to a full row. The caret box
// is shorter than the row by the line box's leading, split above and below it, so scrolling the
// caret box into view leaves the row it is on clipped by half of that at whichever edge it came
// from — below the caret going down, which is where descenders are drawn.
export function caretRowBox(body: HTMLElement, rect: DOMRect): Band {
  const leading = Math.max(0, screenRowHeight(body, rect.height) - rect.height) / 2;
  return { top: rect.top - leading, bottom: rect.bottom + leading };
}

// The part of the body that paints rows. The body's own box includes a horizontal scrollbar when
// the browser draws a classic one, and nothing is painted in that strip: a point measured against
// the box alone can land on the scrollbar at the bottom edge and resolve no row at all.
export function scrollport(body: HTMLElement): Band {
  const view = body.getBoundingClientRect();
  const scrollbar = Math.max(0, body.offsetHeight - body.clientHeight);
  return { top: view.top, bottom: view.bottom - scrollbar };
}

// The point that resolves the screen row next to the caret: the centre of that row, so the hit test
// lands squarely on it rather than a few pixels in from its edge.
export function probePoint(body: HTMLElement, rect: DOMRect, dir: 'up' | 'down'): number {
  const row = caretRowBox(body, rect);
  const height = screenRowHeight(body, rect.height);
  return dir === 'up' ? row.top - height / 2 : row.bottom + height / 2;
}
