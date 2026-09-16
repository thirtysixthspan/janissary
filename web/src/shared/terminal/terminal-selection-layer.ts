import type { Terminal } from '@xterm/xterm';

// Janissary's own selection layer: the model behind the Shift+drag gesture. It is plain data
// plus arithmetic — a snapshot of the terminal's viewport taken when the drag starts, a cell
// grid mapped from pointer positions, and the text a picked range resolves to. Neither xterm
// nor the harness owns any of it, so nothing that redraws the terminal underneath can disturb
// a held selection.

export type Cell = { col: number; row: number };

export type CellRange = { start: Cell; end: Cell };

// One held selection: the frozen screen and, while a drag is running, its two end cells. A
// range whose ends coincide is zero-length and counts as no selection.
export type SelectionLayer = { snapshot: string[]; anchor: Cell; head: Cell };

// The visible screen as text: the `rows` lines starting at the buffer's `viewportY`, rendered
// the way the server-side harness reader renders them (`translateToString(true)`), with
// trailing blank lines dropped. The viewport offset is what separates this from that reader's
// loop — a client terminal has scrollback, so reading the whole buffer would put thousands of
// lines behind an overlay sized to one screen and misaddress every cell coordinate.
export function snapshotViewport(term: Terminal): string[] {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  const start = buffer.viewportY;
  for (let i = start; i < start + term.rows; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  }
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines;
}

type Rect = { left: number; top: number; width: number; height: number };

// A pointer position on a fixed monospace grid: division is exact, so a column is which
// fraction of the container's width the point has crossed. Dragging past the container edge
// clamps to the grid instead of falling off the end.
export function cellFromPoint(
  x: number, y: number, rect: Rect, cellWidth: number, cellHeight: number, cols: number, rows: number,
): Cell {
  const col = Math.min(cols - 1, Math.max(0, cellWidth > 0 ? Math.floor((x - rect.left) / cellWidth) : 0));
  const row = Math.min(rows - 1, Math.max(0, cellHeight > 0 ? Math.floor((y - rect.top) / cellHeight) : 0));
  return { col, row };
}

// A backwards drag reads the same as a forwards one.
export function normalizeRange(a: Cell, b: Cell): CellRange {
  return a.row < b.row || (a.row === b.row && a.col <= b.col)
    ? { start: a, end: b }
    : { start: b, end: a };
}

export function layerHolds(state: SelectionLayer | null): boolean {
  if (!state) return false;
  // Holding means the pick resolves to text: a range through the blank region below a prompt or
  // across trailing whitespace is no selection, so it neither claims the copy chord nor empties
  // the clipboard with it. The extra trim covers multi-blank-row ranges, which arrive as newline
  // separators without any text between them, and subsumes the zero-length check.
  return layerText(state).trim() !== '';
}

// The three cells a line splits into around a selected range, or null when the row is outside
// it. The selected slice is `end.col`-exclusive, which is what makes a zero-length range empty.
export function rangeSplitForLine(line: string, row: number, range: CellRange): [string, string, string] | null {
  if (row < range.start.row || row > range.end.row) return null;
  const from = Math.min(row === range.start.row ? range.start.col : 0, line.length);
  const to = Math.min(row === range.end.row ? range.end.col : line.length, line.length);
  if (from >= to) return [line, '', ''];
  return [line.slice(0, from), line.slice(from, to), line.slice(to)];
}

// The text the layer's pick resolves to: rows joined with newlines, each row's slice taken
// through the grid's chosen columns and its trailing run of spaces trimmed the way a terminal
// selection is expected to read.
export function layerText(state: SelectionLayer | null): string {
  if (!state) return '';
  const range = normalizeRange(state.anchor, state.head);
  const picked: string[] = [];
  const lastRow = Math.min(range.end.row, state.snapshot.length - 1);
  for (let row = range.start.row; row <= lastRow && lastRow >= range.start.row; row++) {
    const parts = rangeSplitForLine(state.snapshot[row] ?? '', row, range);
    if (!parts) continue;
    picked.push(parts[1].trimEnd());
  }
  return picked.join('\n');
}
