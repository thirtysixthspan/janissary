// Fitting the grid's columns to its frame by cutting off the values that do not fit.
//
// A table lays every column out at the width of its longest value, so one long text value pushes the
// rest of the table off the side. When the columns do not all fit, every value is given the same
// widest width it may keep — the cap — chosen as the largest that lets the table fit. A column whose
// values are all narrower than the cap keeps its own width, so the cut falls on the widest columns
// first, and a column never shrinks past its own name. A table too wide even with every value cut to
// its column's name still scrolls, because that is the only way to reach a column at all.
//
// The cap is one number rather than a width per column because the stylesheet applies it as one
// custom property to every data cell; a cell over it is drawn with an ellipsis.

/** One data column's widths, in pixels of content: its name's, and its widest value's. */
export interface ColumnWidths {
  floor: number;
  natural: number;
}

/** The custom property the stylesheet reads each data cell's maximum width from. */
export const CELL_CAP = '--sql-cell-cap';

/** A computed length such as `8px` as a number, and nothing as zero. */
function pixels(length: string): number {
  return Number(length.replace(/px$/, '')) || 0;
}

/** How wide the columns are, in content, when no value may be wider than `cap`. */
function widthAt(columns: readonly ColumnWidths[], cap: number): number {
  return columns.reduce((sum, column) => sum + Math.max(column.floor, Math.min(column.natural, cap)), 0);
}

/**
 * The widest a value may be for the columns to fit `room`, or null when they fit with every value
 * whole. Zero when not even the column names fit, which cuts every value to its column's name.
 */
export function cellCap(columns: readonly ColumnWidths[], room: number): number | null {
  const widest = Math.max(0, ...columns.map((column) => column.natural));
  if (widthAt(columns, widest) <= room) return null;
  let fits = 0;
  let over = Math.ceil(widest);
  while (over - fits > 1) {
    const middle = Math.floor((fits + over) / 2);
    if (widthAt(columns, middle) <= room) fits = middle;
    else over = middle;
  }
  return fits;
}

/**
 * The frame's data columns and the room they share, read from the rendered table.
 *
 * Every width is the content's own, read from a range over it: a cell's box is stretched to fill a
 * table that fits and clipped in one that does not, and neither is how wide its value is. The room is
 * the frame less the two gutters and each data cell's padding.
 */
export function measureColumns(frame: HTMLElement): { columns: ColumnWidths[]; room: number } | null {
  const heads = [...frame.querySelectorAll(':scope thead tr:first-child th')];
  const named = heads.filter((head) => !head.classList.contains('sql-gutter'));
  const first = named[0];
  if (!first) return null;
  const style = getComputedStyle(first);
  const padding = pixels(style.paddingLeft) + pixels(style.paddingRight);
  const gutters = heads
    .filter((head) => head.classList.contains('sql-gutter'))
    .reduce((sum, head) => sum + head.getBoundingClientRect().width, 0);
  const range = document.createRange();
  const contentWidth = (node: Node): number => {
    range.selectNodeContents(node);
    return range.getBoundingClientRect().width;
  };
  const rows = [...frame.querySelectorAll(':scope tbody tr')].map((row) => row.querySelectorAll(':scope > td.sql-cell'));
  const columns = named.map((head, index) => ({
    floor: contentWidth(head),
    natural: Math.max(0, ...rows.map((cells) => {
      const cell = cells[index];
      return cell ? contentWidth(cell) : 0;
    })),
  }));
  // One pixel short of the frame, so rounding in the table's own layout never adds a scrollbar.
  return { columns, room: frame.clientWidth - gutters - padding * named.length - 1 };
}

/** Measure the frame's table and set the cap its cells are drawn to, or clear it when all fit. */
export function fitColumns(frame: HTMLElement): void {
  const measured = measureColumns(frame);
  const cap = measured ? cellCap(measured.columns, measured.room) : null;
  if (cap === null) frame.style.removeProperty(CELL_CAP);
  else frame.style.setProperty(CELL_CAP, `${cap}px`);
}
