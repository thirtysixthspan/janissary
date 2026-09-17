import type { Terminal } from '@xterm/xterm';

// Janissary's own selection layer: the model behind the Shift+drag gesture. It is plain data
// plus arithmetic — a snapshot of the terminal's viewport taken when the drag starts, a cell
// grid mapped from pointer positions, and the text a picked range resolves to. Neither xterm
// nor the harness owns any of it, so nothing that redraws the terminal underneath can disturb
// a held selection.

export type Cell = { col: number; row: number };

export type CellRange = { start: Cell; end: Cell };

// One held selection: the frozen screen and, while a drag is running, its two end cells. A
// range whose ends coincide is zero-length and counts as no selection. `cells` carries, per
// snapshot line, the string index each terminal cell starts at — a double-width glyph occupies
// two cells but emits one code point, so cell column and string index do not coincide.
export type SelectionLayer = { snapshot: string[]; cells: number[][]; anchor: Cell; head: Cell };

// East Asian wide/fullwidth and the heavy emoji planel ranges: the glyph classes that occupy two
// terminal cells in the grid the pointer drags across.
function isDoubleWidth(cp: number): boolean {
  return (cp >= 0x11_00 && cp <= 0x11_5F)
    || (cp >= 0x2e_80 && cp <= 0x9f_ff)
    || (cp >= 0xac_00 && cp <= 0xd7_a3)
    || (cp >= 0xf9_00 && cp <= 0xfa_ff)
    || (cp >= 0xfe_30 && cp <= 0xfe_6f)
    || (cp >= 0xff_00 && cp <= 0xff_60)
    || (cp >= 0xff_e0 && cp <= 0xff_e6)
    || (cp >= 0x1_f3_00 && cp <= 0x1_fa_ff)
    || cp >= 0x2_00_00;
}

// The string index each cell of a line starts at. A narrow glyph owns one cell; a wide one owns
// two — its first cell starts at the glyph, its second at the index after it, so a pick bounded
// there keeps the whole glyph.
export function selectionCellIndices(line: string): number[] {
  const cells: number[] = [];
  let index = 0;
  for (const glyph of line) {
    cells.push(index);
    if (isDoubleWidth(glyph.codePointAt(0) ?? 0)) cells.push(index + glyph.length);
    index += glyph.length;
  }
  return cells;
}

export type ViewportSnapshot = { snapshot: string[]; cells: number[][] };

// The visible screen as text: the `rows` lines starting at the buffer's `viewportY`, rendered
// the way the server-side harness reader renders them (`translateToString(true)`), with
// trailing blank lines dropped. The viewport offset is what separates this from that reader's
// loop — a client terminal has scrollback, so reading the whole buffer would put thousands of
// lines behind an overlay sized to one screen and misaddress every cell coordinate. Runs the
// cell walker beside each line, so a picked column can always be resolved through the grid.
export function snapshotViewport(term: Terminal): ViewportSnapshot {
  const buffer = term.buffer.active;
  const snapshot: string[] = [];
  const cells: number[][] = [];
  const start = buffer.viewportY;
  for (let i = start; i < start + term.rows; i++) {
    const line = buffer.getLine(i)?.translateToString(true) ?? '';
    snapshot.push(line);
    cells.push(selectionCellIndices(line));
  }
  while (snapshot.length > 0 && snapshot.at(-1) === '') {
    snapshot.pop();
    cells.pop();
  }
  return { snapshot, cells };
}

type Rect = { left: number; top: number; width: number; height: number };

// The grid the frozen screen sits on: the emulator's own cell size, and where its screen box
// starts inside the surface's container. Both painting and hit-testing read these, so the cell
// under the pointer is always the cell the user sees under it.
export type ScreenMetrics = { cellWidth: number; cellHeight: number; offsetLeft: number; offsetTop: number };

// A pointer position on a fixed monospace grid: division is exact, so a column is which
// fraction of the grid's width the point has crossed. The offsets move the origin from the
// container's corner to the screen's, which is where the first cell actually starts. Dragging past
// the grid's edge clamps to it instead of falling off the end.
export function cellFromPoint(
  x: number, y: number, rect: Rect, metrics: ScreenMetrics, cols: number, rows: number,
): Cell {
  const { cellWidth, cellHeight, offsetLeft, offsetTop } = metrics;
  const col = Math.min(cols - 1, Math.max(0, cellWidth > 0 ? Math.floor((x - rect.left - offsetLeft) / cellWidth) : 0));
  const row = Math.min(rows - 1, Math.max(0, cellHeight > 0 ? Math.floor((y - rect.top - offsetTop) / cellHeight) : 0));
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
// `cells` names where each grid cell of the line's text starts, so a picked column means its
// cell, not its string position; without one the column is the plain string index, which is
// exactly what every ASCII line resolves through.
export function rangeSplitForLine(
  line: string, row: number, range: CellRange, cells?: readonly number[],
): [string, string, string] | null {
  if (row < range.start.row || row > range.end.row) return null;
  const columnStart = (col: number) => (cells ? cells[col] ?? line.length : Math.min(col, line.length));
  const from = Math.min(row === range.start.row ? columnStart(range.start.col) : 0, line.length);
  const to = Math.min(row === range.end.row ? columnStart(range.end.col) : line.length, line.length);
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
    const parts = rangeSplitForLine(state.snapshot[row] ?? '', row, range, state.cells?.[row]);
    if (!parts) continue;
    picked.push(parts[1].trimEnd());
  }
  return picked.join('\n');
}
