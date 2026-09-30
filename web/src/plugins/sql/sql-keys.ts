// The grid's keyboard navigation, kept beside the rule rather than in the component so the arithmetic
// is testable without a render and `DataGrid.tsx` does not grow past its 200-line limit.
//
// The arrows stop at the ends rather than wrapping, which is the character every other plugin list
// shares through `nextListSelection` in `web/src/shared/list-selection.ts`. That rule is
// one-dimensional — a list of rows — and so is this one, because the grid highlights rows and not
// cells: there is no column for a key to move along.
//
// Left and right are absent on purpose. The grid is a list of rows, so they have nothing to move, and
// a key with no effect is left to the browser rather than swallowed with a `preventDefault`.
//
// Tab is deliberately not handled: it belongs to the host, which walks out of a plugin tab and must
// keep doing so.

export const GRID_NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * The row a key moves the run's edge to.
 *
 * This is `nextListSelection` from `web/src/shared/list-selection.ts` — the rule the file navigator
 * and every plugin record list move a selected row with — written out rather than imported, because a
 * client plugin may reach only its own api and the shared stylesheet. It is deliberately the same
 * rule and not an adaptation: a row selection is one-dimensional, so there is nothing to stretch.
 */
export function nextRowSelection(rows: number, at: number | null, key: string): number | null {
  if (rows === 0) return null;
  // With nothing marked the key starts the run rather than moving an edge that is not there, so it
  // lands on the first row — and on the last one for `End`, which is a place to go to.
  if (at === null) return key === 'End' ? rows - 1 : 0;
  if (key === 'ArrowDown') return Math.min(at + 1, rows - 1);
  if (key === 'ArrowUp') return Math.max(at - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return rows - 1;
  return at;
}
