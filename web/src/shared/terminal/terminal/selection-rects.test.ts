import { describe, expect, it } from 'vitest';
import { highlightRects } from './selection-rects';
import { selectionCellIndices, type Cell, type SelectionLayer } from './selection-layer';

const cell = (col: number, row: number): Cell => ({ col, row });
// 10px-by-20px cells on a screen that starts 4px in and 6px down from the container's corner.
const metrics = { cellWidth: 10, cellHeight: 20, offsetLeft: 4, offsetTop: 6 };

function layer(snapshot: string[], anchor: Cell, head: Cell): SelectionLayer {
  return { snapshot, cells: snapshot.map((line) => selectionCellIndices(line)), anchor, head };
}

describe('highlightRects', () => {
  it('covers the picked columns of a single-row range', () => {
    const rects = highlightRects(layer(['alpha beta'], cell(6, 0), cell(10, 0)), metrics);
    expect(rects).toEqual([{ row: 0, left: 64, top: 6, width: 40, height: 20 }]);
  });

  it('gives every row of a multi-row range its own rectangle', () => {
    const rects = highlightRects(layer(['  first   ', 'second', 'third  '], cell(5, 0), cell(3, 2)), metrics);
    expect(rects).toEqual([
      { row: 0, left: 54, top: 6, width: 50, height: 20 },
      { row: 1, left: 4, top: 26, width: 60, height: 20 },
      { row: 2, left: 4, top: 46, width: 30, height: 20 },
    ]);
  });

  it('reads a backwards drag the same way round as a forwards one', () => {
    const forwards = highlightRects(layer(['alpha beta'], cell(2, 0), cell(7, 0)), metrics);
    expect(highlightRects(layer(['alpha beta'], cell(7, 0), cell(2, 0)), metrics)).toEqual(forwards);
  });

  it('stops a row where its text stops, and skips the rows with none', () => {
    const rects = highlightRects(layer(['ab', '', 'cdef'], cell(0, 0), cell(9, 2)), metrics);
    expect(rects).toEqual([
      { row: 0, left: 4, top: 6, width: 20, height: 20 },
      { row: 2, left: 4, top: 46, width: 40, height: 20 },
    ]);
  });

  it('paints nothing for a zero-length range, a range past the snapshot, or no layer', () => {
    expect(highlightRects(layer(['alpha'], cell(3, 0), cell(3, 0)), metrics)).toEqual([]);
    expect(highlightRects(layer(['one'], cell(0, 5), cell(5, 7)), metrics)).toEqual([]);
    expect(highlightRects(null, metrics)).toEqual([]);
  });

  it('resolves double-width glyphs by the cells they occupy, not their string length', () => {
    // 漢字 fills four cells; a pick across both glyphs is four cells wide, not two.
    const rects = highlightRects(layer(['漢字 ab'], cell(0, 0), cell(4, 0)), metrics);
    expect(rects).toEqual([{ row: 0, left: 4, top: 6, width: 40, height: 20 }]);
  });
});
