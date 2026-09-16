import { describe, expect, it } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import {
  cellFromPoint, layerHolds, layerText, normalizeRange, rangeSplitForLine, snapshotViewport,
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
const rect = { left: 100, top: 0, width: 800, height: 480 };

describe('snapshotViewport', () => {
  it('reads the viewport rows starting at the offset, not the whole buffer', () => {
    const lines = Array.from({ length: 24 }, (_, i) => `scrollback ${i}`);
    const screen = Array.from({ length: 24 }, (_, i) => `screen ${i}`);
    const snapshot = snapshotViewport(fakeTerminal([...lines, ...screen], 24));
    expect(snapshot).toEqual(screen);
  });

  it('drops trailing blank lines and yields nothing for an empty screen', () => {
    expect(snapshotViewport(fakeTerminal(['one', 'two', '', '', ''], 0, 24))).toEqual(['one', 'two']);
    expect(snapshotViewport(fakeTerminal([], 0, 24))).toEqual([]);
  });
});

describe('cellFromPoint', () => {
  it('maps a point inside the container onto its cell', () => {
    expect(cellFromPoint(300, 240, rect, 80, 24)).toEqual(cell(20, 12));
    expect(cellFromPoint(107, 30, rect, 80, 24)).toEqual(cell(0, 1));
  });

  it('clamps points outside the container to the grid edge', () => {
    expect(cellFromPoint(0, 0, rect, 80, 24)).toEqual(cell(0, 0));
    expect(cellFromPoint(900, 600, rect, 80, 24)).toEqual(cell(79, 23));
    expect(cellFromPoint(50, 300, rect, 80, 24)).toEqual(cell(0, 15));
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
    const state = { snapshot: ['alpha beta'], anchor: cell(4, 0), head: cell(4, 0) };
    expect(layerHolds(state)).toBe(false);
    expect(layerText(state)).toBe('');
    expect(layerHolds(null)).toBe(false);
  });

  it('joins a multi-line range with newlines and trims each line', () => {
    const snapshot = ['  first   ', 'second', 'third  '];
    const state = { snapshot, anchor: cell(5, 0), head: cell(3, 2) };
    expect(layerHolds(state)).toBe(true);
    expect(layerText(state)).toBe('st\nsecond\nthi');
  });

  it('takes only the columns between the two cells of a single-line range', () => {
    const state = { snapshot: ['alpha beta'], anchor: cell(6, 0), head: cell(10, 0) };
    expect(layerText(state)).toBe('beta');
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
