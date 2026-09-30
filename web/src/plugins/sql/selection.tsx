import { useEffect, useState } from 'react';
import type React from 'react';
import type { SqlRow } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { rowRange, selectionTo, selectionToTsv, type CellPosition, type CellRange } from './grid-view';

// The selection and its copy. A selection is a rectangle of cells, anchored where the run started and
// reaching wherever it got to; a run has no direction, so dragging back over the anchor selects the
// same rectangle as dragging away from it.
//
// A plugin tab stays mounted while another tab covers it, so a window-level key listener is gated on
// `capabilities.active` — otherwise Copy would act on a grid the user is not looking at. That is the
// same rule the plugin contract states for any window-wide listener, and the markdown and pdf
// plugins follow it for their own keys.
//
// A cell is not rendered inside a button, so a click on the text inside it is an ordinary selection
// and the browser's own copy still works: a user who selects a word and presses Copy gets the word.

/** The `td` a node sits in, or null for anything outside the grid's cells. */
function cellOf(node: Node | null): Element | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest('td.sql-cell') ?? null;
}

/**
 * Whether the browser's own selection was made inside one cell, which is a word the user selected
 * and not a run of cells.
 *
 * A shift-click extending a run leaves a browser selection too — from wherever the caret landed in
 * the first cell to the end of the last — and standing aside for *any* non-empty selection is what
 * stopped the grid's own copy of a run from ever running, so a pasted run lost its first value. The
 * two ends of the selection are the whole of the difference: a word's are in one cell, a run's are
 * not, however much text either of them covers.
 */
function selectedWithinOneCell(): boolean {
  const selection = getSelection();
  if (!selection || selection.isCollapsed) return false;
  const cell = cellOf(selection.anchorNode);
  return cell !== null && cell === cellOf(selection.focusNode);
}

/**
 * Whether a press starts or extends a run of cells, claiming it from the browser when it extends.
 *
 * A shift-click would otherwise leave the browser selecting the text between the first cell's caret
 * and the end of the last, and the copy chord finds that one first. A plain press is left alone, so
 * the caret still lands where it was clicked and a word inside that cell can be selected afterwards.
 *
 * It answers and acts in one step because they are one fact: this press extends a run exactly when
 * the browser's own selection over the same cells has become wrong.
 */
export function startRun(event: React.MouseEvent): boolean {
  if (!event.shiftKey) return false;
  event.preventDefault();
  return true;
}

export function useGridSelection(
  grid: { columns: string[]; rows: SqlRow[] } | null,
  capabilities: TabPluginClientCapabilities,
  onError: (error: string) => void,
) {
  const [range, setRange] = useState<CellRange | null>(null);
  const active = capabilities.active;

  // A new page or a new set of columns has nothing to do with the old selection, and keeping it would
  // leave cells highlighted that now hold different values.
  useEffect(() => setRange(null), [grid]);

  useEffect(() => {
    if (!active) return;
    // The keyboard route to the same copy, for the muscle memory of a spreadsheet. Cells are not
    // rendered inside a button, so a user who selected text inside a cell and presses Copy still
    // gets that text from the browser's own handler first; this only fires when nothing else did.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'c') return;
      if (selectedWithinOneCell()) return;
      if (!range || !grid) return;
      const text = selectionToTsv(grid.rows, grid.columns, range.from, range.to);
      if (!text) return;
      event.preventDefault();
      void navigator.clipboard.writeText(text)
        .catch(() => onError(`Copy is unavailable here. Select and copy this text: ${text}`));
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active, range, grid, onError]);

  /** Start a run at this cell, or extend the one in progress when shift is held. */
  const select = (at: CellPosition, extend: boolean) => {
    setRange((previous) => (extend && previous ? selectionTo(previous.from, at) : { from: at, to: at }));
  };

  /**
   * Put a whole row in the selection, or extend the one in progress to end at it.
   *
   * The same rectangle a run of cells makes — a row is simply the widest one there is, from the first
   * visible column to the last — so the copy path needs nothing new for it: one row of a run is one
   * line of tab-separated text.
   */
  const selectRow = (row: number, extend: boolean) => {
    const last = Math.max(0, (grid?.columns.length ?? 1) - 1);
    setRange((previous) => rowRange(row, last, extend ? previous : null));
  };

  return {
    range,
    select,
    selectRow,
    clear() { setRange(null); },
    selected(at: CellPosition) {
      return range !== null
        && at.row >= range.from.row && at.row <= range.to.row
        && at.cell >= range.from.cell && at.cell <= range.to.cell;
    },
  };
}
