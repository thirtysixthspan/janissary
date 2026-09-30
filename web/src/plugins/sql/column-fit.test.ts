import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CELL_CAP, cellCap, fitColumns, type ColumnWidths } from './column-fit';
import { useColumnFit } from './useColumnFit';

const total = (columns: ColumnWidths[], cap: number) =>
  columns.reduce((sum, column) => sum + Math.max(column.floor, Math.min(column.natural, cap)), 0);

describe('cellCap', () => {
  const columns: ColumnWidths[] = [
    { floor: 20, natural: 10 },
    { floor: 40, natural: 30 },
    { floor: 40, natural: 2800 },
  ];

  // A table that fits is laid out as a table lays itself out, so nothing is cut.
  it('is nothing when every value fits whole', () => {
    expect(cellCap(columns, 2870)).toBeNull();
  });

  // The cut falls on the widest column: the narrow ones keep their own width, so the long value takes
  // all the room they do not need.
  it('cuts the widest value to what the narrow columns leave', () => {
    expect(cellCap(columns, 600)).toBe(540);
  });

  it('is the widest cap that still fits', () => {
    const wide: ColumnWidths[] = [
      { floor: 30, natural: 300 }, { floor: 30, natural: 500 }, { floor: 30, natural: 90 },
    ];
    const cap = cellCap(wide, 500) as number;
    expect(total(wide, cap)).toBeLessThanOrEqual(500);
    expect(total(wide, cap + 1)).toBeGreaterThan(500);
    expect(cap).toBe(205);
  });

  // A column never shrinks past its own name, so a table with more names than room is cut to its
  // names and still scrolls — that is the only way left to reach a column.
  it('cuts every value to its column name when not even the names fit', () => {
    expect(cellCap(columns, 50)).toBe(0);
  });
});

/**
 * A frame holding a rendered table, with the layout jsdom does not have stubbed in: each cell's
 * content is as wide as the number written in its `data-width`.
 */
function frameOf(clientWidth: number, heads: number[], rows: number[][]) {
  const frame = document.createElement('div');
  const row = (cells: number[]) => `<tr><td class="sql-gutter"></td>${
    cells.map((width) => `<td class="sql-cell" data-width="${width}"></td>`).join('')
  }<td class="sql-gutter"></td></tr>`;
  // The cells carry no padding, so the widths below are the whole of each column.
  frame.innerHTML = `<table><thead><tr><th class="sql-gutter"></th>${
    heads.map((width) => `<th style="padding: 0" data-width="${width}"></th>`).join('')
  }<th class="sql-gutter"></th></tr></thead><tbody>${rows.map((cells) => row(cells)).join('')}</tbody></table>`;
  resize(frame, clientWidth);
  for (const gutter of frame.querySelectorAll(':scope th.sql-gutter')) {
    gutter.getBoundingClientRect = () => ({ width: 30 }) as DOMRect;
  }
  let selected: HTMLElement | null = null;
  vi.spyOn(document, 'createRange').mockReturnValue({
    selectNodeContents(node: Node) { selected = node as HTMLElement; },
    getBoundingClientRect: () => ({ width: Number(selected?.dataset.width) }),
  } as unknown as Range);
  return frame;
}

function resize(frame: HTMLElement, clientWidth: number) {
  Object.defineProperty(frame, 'clientWidth', { value: clientWidth, configurable: true });
}

describe('fitColumns', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // Gutters take 60 of the 661, and a pixel is kept back for rounding: 600 left for the columns.
  it('sets the cap its cells are drawn to when the table is wider than the frame', () => {
    const frame = frameOf(661, [20, 40, 40], [[10, 30, 2800], [8, 25, 90]]);
    fitColumns(frame);
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('540px');
  });

  it('clears the cap once the frame is wide enough for every value', () => {
    const frame = frameOf(661, [20, 40, 40], [[10, 30, 2800]]);
    fitColumns(frame);
    resize(frame, 4000);
    fitColumns(frame);
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('');
  });

  it('leaves a table with no columns alone', () => {
    const frame = document.createElement('div');
    frame.innerHTML = '<table><thead><tr></tr></thead></table>';
    fitColumns(frame);
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('');
  });
});

describe('useColumnFit', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function observed() {
    const watchers: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: () => void) { watchers.push({ callback, observe: this.observe, disconnect: this.disconnect }); }
    });
    return watchers;
  }

  // A dock dragged wider, or a split pane, changes the room without changing a row.
  it('fits the columns on arrival and again whenever the frame is resized', () => {
    const watchers = observed();
    const frame = frameOf(661, [20, 40, 40], [[10, 30, 2800]]);
    const { unmount } = renderHook(() => useColumnFit({ frameRef: { current: frame as HTMLDivElement }, grid: {}, hidden: [], editing: null }));
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('540px');
    expect(watchers[0]?.observe).toHaveBeenCalledWith(frame);

    resize(frame, 4000);
    watchers[0]?.callback();
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('');

    unmount();
    expect(watchers[0]?.disconnect).toHaveBeenCalled();
  });

  // A new page can hold longer values than the last, so the fit is not the one it arrived with.
  it('fits again when the page changes', () => {
    observed();
    const frame = frameOf(4000, [20, 40, 40], [[10, 30, 2800]]);
    const frameRef = { current: frame as HTMLDivElement };
    const { rerender } = renderHook(({ grid }) => useColumnFit({ frameRef, grid, hidden: [], editing: null }), {
      initialProps: { grid: {} },
    });
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('');
    resize(frame, 661);
    rerender({ grid: {} });
    expect(frame.style.getPropertyValue(CELL_CAP)).toBe('540px');
  });
});
