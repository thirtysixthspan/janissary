import { useEffect, useState } from 'react';
import type { CellPosition } from './grid-view';

// The grid's keyboard navigation, kept beside the rule rather than in the component so the arithmetic
// is testable without a render and `DataGrid.tsx` does not grow past its 200-line limit.
//
// The arrows stop at the ends rather than wrapping, which is the character every other plugin list
// shares through `nextListSelection` in `web/src/shared/list-selection.ts`. That rule is
// one-dimensional — a list of rows — and a grid is two, so this is its own rule rather than a
// stretched copy of that one.
//
// Tab is deliberately not handled: it belongs to the host, which walks out of a plugin tab and must
// keep doing so.

export const GRID_NAVIGATION_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
]);

/** The position a key moves a cell cursor to, or the one it had, or none on an empty grid. */
export function nextCellSelection(
  rows: number,
  columns: number,
  at: CellPosition | null,
  key: string,
): CellPosition | null {
  if (rows <= 0 || columns <= 0) return null;
  const here = at ?? { row: 0, cell: 0 };
  if (key === 'ArrowLeft') return { row: here.row, cell: Math.max(here.cell - 1, 0) };
  if (key === 'ArrowRight') return { row: here.row, cell: Math.min(here.cell + 1, columns - 1) };
  if (key === 'ArrowUp') return { row: Math.max(here.row - 1, 0), cell: here.cell };
  if (key === 'ArrowDown') return { row: Math.min(here.row + 1, rows - 1), cell: here.cell };
  if (key === 'Home') return { row: here.row, cell: 0 };
  if (key === 'End') return { row: here.row, cell: columns - 1 };
  return at;
}

export type GridKeyOptions = {
  // A plugin tab stays mounted while another tab covers it, so a window-level listener has to be
  // gated on this — the same rule the copy shortcut follows in `selection.tsx`.
  active: boolean;
  rows: number;
  /** The visible columns, so a hidden column is not somewhere the cursor lands. */
  columns: readonly string[];
  /** Open the editor on a cell. The component owns what that means for a row and a column. */
  onEdit(at: CellPosition): void;
};

/**
 * The window listener behind the grid's keys.
 *
 * Movement and the two actions are answered separately, so the component stays a caller of the keys
 * rather than their owner. Escape clears the cursor; Enter opens the editor on the cell the cursor is
 * on, which the component refuses for a read-only object because that is its knowledge and not this
 * hook's. Every key reports nothing — the component reads the new cursor, so nothing has to be
 * threaded back out of a keypress.
 */
export function useGridKeys({ active, rows, columns, onEdit }: GridKeyOptions) {
  const [cursor, setCursor] = useState<CellPosition | null>(null);

  // A page change leaves the cursor on a position that now holds other values, the same reason the
  // mouse selection is forgotten when the grid changes. The dependencies are counts rather than the
  // column list itself, which is a fresh array on every render and would clear the cursor at once.
  useEffect(() => { setCursor(null); }, [rows, columns.length]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!cursor) return;
        setCursor(null);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter') {
        if (!cursor) return;
        event.preventDefault();
        onEdit(cursor);
        return;
      }
      if (!GRID_NAVIGATION_KEYS.has(event.key)) return;
      event.preventDefault();
      setCursor((from) => nextCellSelection(rows, columns.length, from, event.key));
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active, cursor, rows, columns, onEdit]);

  return { cursor, clearCursor: () => setCursor(null) };
}
