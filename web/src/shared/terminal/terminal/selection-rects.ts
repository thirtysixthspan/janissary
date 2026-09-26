import { normalizeRange, type CellRange, type ScreenMetrics, type SelectionLayer } from './selection-layer';

// The highlight over a cloned screen. Nothing re-draws the frozen text, so the picked run cannot
// be carried by a span wrapped around it the way the plain-text overlay does; it is painted as
// translucent rectangles laid on the same grid the clone sits on.

export type HighlightRect = { row: number; left: number; top: number; width: number; height: number };

// Where a row's highlight starts and ends, in cells. Columns are clamped to the row's own cell
// count, so the rectangle stops where the row's text stops — the blank remainder of a line is not
// part of what the pick copies, and painting it would say otherwise.
function rowSpan(state: SelectionLayer, row: number, range: CellRange): [number, number] | null {
  const cells = state.cells[row]?.length ?? 0;
  const from = row === range.start.row ? Math.min(range.start.col, cells) : 0;
  const to = row === range.end.row ? Math.min(range.end.col, cells) : cells;
  return to > from ? [from, to] : null;
}

// One rectangle per selected row of the snapshot, positioned against the frozen screen's own
// origin so the highlight lands on the cells the clone drew.
export function highlightRects(state: SelectionLayer | null, metrics: ScreenMetrics): HighlightRect[] {
  if (!state) return [];
  const range = normalizeRange(state.anchor, state.head);
  const rects: HighlightRect[] = [];
  const lastRow = Math.min(range.end.row, state.snapshot.length - 1);
  for (let row = range.start.row; row <= lastRow; row++) {
    const span = rowSpan(state, row, range);
    if (!span) continue;
    rects.push({
      row,
      left: metrics.offsetLeft + span[0] * metrics.cellWidth,
      top: metrics.offsetTop + row * metrics.cellHeight,
      width: (span[1] - span[0]) * metrics.cellWidth,
      height: metrics.cellHeight,
    });
  }
  return rects;
}
