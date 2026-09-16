import { describe, expect, it } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  cellFromPoint, layerHolds, layerText, normalizeRange, rangeSplitForLine, selectionCellIndices, snapshotViewport,
} from './terminal-selection-layer';

// A stand-in terminal whose buffer is a simple list of lines: `translateToString(true)` renders
// right-trimmed, matching the real API the snapshot loop drives.
function fakeTerminal(lines: string[], viewportY: number, rows: number = 24): Terminal {
  const padded = [...lines];
  while (padded.length < viewportY + rows) padded.push('');
  return {
    buffer: {
      active: {
        viewportY,
        getLine: (index: number) => (padded[index] === undefined ? null : {
          translateToString: (trim: boolean) => (trim ? padded[index].trimEnd() : padded[index]),
        }),
      },
    },
    rows,
  } as unknown as Terminal;
}

const cell = (col: number, row: number) => ({ col, row });
// The same geometry the earlier container-division tests used, expressed the way the hook now
// supplies it: the container's origin via the rect and 10px-by-20px cells measured off the
// overlay's probe row.
const rect = { left: 100, top: 0, width: 800, height: 480 };
const cellFrom = (x: number, y: number) => cellFromPoint(x, y, rect, 10, 20, 80, 24);

describe('snapshotViewport', () => {
  it('reads the viewport rows starting at the offset, not the whole buffer', () => {
    const lines = Array.from({ length: 24 }, (_, i) => `scrollback ${i}`);
    const screen = Array.from({ length: 24 }, (_, i) => `screen ${i}`);
    const snapshot = snapshotViewport(fakeTerminal([...lines, ...screen], 24));
    expect(snapshot.snapshot).toEqual(screen);
    expect(snapshot.cells).toEqual(screen.map((line) => selectionCellIndices(line)));
  });

  it('drops trailing blank lines and yields nothing for an empty screen', () => {
    expect(snapshotViewport(fakeTerminal(['one', 'two', '', '', ''], 0, 24))).toEqual({ snapshot: ['one', 'two'], cells: [[0, 1, 2], [0, 1, 2]] });
    expect(snapshotViewport(fakeTerminal([], 0, 24))).toEqual({ snapshot: [], cells: [] });
  });
});

describe('cellFromPoint', () => {
  it('maps a point inside the container onto its cell', () => {
    expect(cellFrom(300, 240)).toEqual(cell(20, 12));
    expect(cellFrom(107, 30)).toEqual(cell(0, 1));
  });

  it('clamps points outside the container to the grid edge', () => {
    expect(cellFrom(0, 0)).toEqual(cell(0, 0));
    expect(cellFrom(900, 600)).toEqual(cell(79, 23));
    expect(cellFrom(50, 300)).toEqual(cell(0, 15));
  });
});

describe('normalizeRange', () => {
  it('orders a backwards drag like the forwards one', () => {
    expect(normalizeRange(cell(5, 3), cell(2, 1))).toEqual({ start: cell(2, 1), end: cell(5, 3) });
    expect(normalizeRange(cell(5, 3), cell(9, 3))).toEqual({ start: cell(5, 3), end: cell(9, 3) });
  });
});

describe('layer holds and text', () => {
  it('counts a zero-length range as no selection and empty text', () => {
    const state = { snapshot: ['alpha beta'], cells: [selectionCellIndices('alpha beta')], anchor: cell(4, 0), head: cell(4, 0) };
    expect(layerHolds(state)).toBe(false);
    expect(layerText(state)).toBe('');
    expect(layerHolds(null)).toBe(false);
  });

  it('joins a multi-line range with newlines and trims each line', () => {
    const snapshot = ['  first   ', 'second', 'third  '];
    const state = { snapshot, cells: snapshot.map((line) => selectionCellIndices(line)), anchor: cell(5, 0), head: cell(3, 2) };
    expect(layerHolds(state)).toBe(true);
    expect(layerText(state)).toBe('st\nsecond\nthi');
  });

  it('takes only the columns between the two cells of a single-line range', () => {
    const state = { snapshot: ['alpha beta'], cells: [selectionCellIndices('alpha beta')], anchor: cell(6, 0), head: cell(10, 0) };
    expect(layerText(state)).toBe('beta');
  });

  it('resolves a line whose first glyph is double-width by cells, not string indices', () => {
    const line = '漢字 ab';
    const cells = selectionCellIndices(line);
    // Cells 0..1 to 1..2 name the two halves of 漢字's two glyphs; the columns must yield the
    // glyphs, not the string slice a naive index would take.
    const state = { snapshot: [line], cells: [cells], anchor: cell(0, 0), head: cell(3, 0) };
    expect(layerText(state)).toBe('漢字');
    expect(rangeSplitForLine(line, 0, { start: cell(0, 0), end: cell(1, 0) }, cells)).toEqual(['', '漢', '字 ab']);
  });

  it('maps past-line cells to the line start and end the clamped way', () => {
    const cells = selectionCellIndices('ab');
    const range = { start: cell(0, 0), end: cell(9, 0) };
    expect(rangeSplitForLine('ok', 0, range, cells)).toEqual(['', 'ok', '']);
  });

  it('resolves a plain ascii line exactly as the string-index version did', () => {
    const state = { snapshot: ['alpha'], cells: [selectionCellIndices('alpha')], anchor: cell(0, 0), head: cell(3, 0) };
    expect(layerText(state)).toBe('alp');
  });

  it('treats a range past the snapshot as empty text and no selection', () => {
    const state = { snapshot: ['one'], cells: [selectionCellIndices('one')], anchor: cell(0, 5), head: cell(5, 7) };
    expect(layerText(state)).toBe('');
    expect(layerHolds(state)).toBe(false);
  });
});

describe('rangeSplitForLine', () => {
  it('refuses and then splits around the range', () => {
    const range = normalizeRange(cell(2, 0), cell(7, 1));
    expect(rangeSplitForLine('anything', 5, range)).toBeNull();
    expect(rangeSplitForLine('anything', 0, range)).toEqual(['an', 'ything', '']);
    expect(rangeSplitForLine('anything', 1, range)).toEqual(['', 'anythin', 'g']);
  });

  it('renders zero-length ranges with an empty slice', () => {
    const range = normalizeRange(cell(3, 0), cell(3, 0));
    expect(rangeSplitForLine('abc', 0, range)).toEqual(['abc', '', '']);
  });
});
