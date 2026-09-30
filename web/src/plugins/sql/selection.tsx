import { useEffect, useState } from 'react';
import type React from 'react';
import type { SqlRow } from '@shared/plugins/sql/shared';
import { GRID_NAVIGATION_KEYS, nextRowSelection } from './sql-keys';
import { rowRange, selectionToTsv, type RowRange } from './grid-view';
import { revealRow } from './reveal-row';

// The highlighted run of rows, the keys that move it, and its copy.
//
// The grid highlights rows and not cells: a press anywhere in a row highlights that whole row, which
// is the unit everything else in this tab acts on — a write names a row and a column because the
// statement needs both, and nothing here acts on a cell alone. A run has no direction, so selecting
// upwards reaches the same rows as selecting downwards.
//
// A plugin tab stays mounted while another tab covers it, so a window-level key listener is gated on
// `capabilities.active` — otherwise the arrow keys would move a grid the user is not looking at. That
// is the same rule the plugin contract states for any window-wide listener, and the markdown and pdf
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
 * and not a run of rows.
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
 * Whether a press starts or extends a run, claiming it from the browser when it extends.
 *
 * A shift-click would otherwise leave the browser selecting the text between the first row's caret
 * and the end of the last, and the copy chord finds that one first. A plain press is left alone, so
 * the caret still lands where it was clicked and a word inside that cell can be selected afterwards.
 */
export function startRun(event: React.MouseEvent): boolean {
  if (!event.shiftKey) return false;
  event.preventDefault();
  return true;
}

export function useGridSelection({
  grid, active, containerRef, onError,
}: {
  grid: { rows: SqlRow[] } | null;
  active: boolean;
  /** The frame the rows scroll inside, so a run that leaves the page is brought back into it. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  onError(error: string): void;
}) {
  const [range, setRange] = useState<RowRange | null>(null);
  const rows = grid?.rows.length ?? 0;

  // A new page or a new query has nothing to do with the old run, and keeping it would highlight rows
  // that now hold other values. The first row is what the new page highlights, so a grid that has
  // just been read is ready for the keyboard without a keypress.
  useEffect(() => { setRange(rows === 0 ? null : { from: 0, to: 0 }); }, [grid, rows]);

  // The highlighted row follows the keys that move it, and only when it would otherwise be out of
  // sight — the file navigator's `nearest` rule, measured below the sticky header rather than
  // behind it.
  useEffect(() => {
    const frame = containerRef.current;
    if (range === null || !frame) return;
    const row = frame.querySelector(`[data-row="${CSS.escape(String(range.to))}"]`);
    if (row) revealRow(frame, row, range.to === 0);
  }, [range, containerRef]);

  useEffect(() => {
    if (!active) return;
    // The keyboard route to the same copy, for the muscle memory of a spreadsheet. Cells are not
    // rendered inside a button, so a user who selected text inside a cell and presses Copy still
    // gets that text from the browser's own handler first; this only fires when nothing else did.
    // It answers only while the grid has the focus, for the same reason its other keys do: text
    // selected in the command bar is the user's, and copying the highlighted rows over it would
    // replace what they selected with what they did not.
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'c') return;
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (selectedWithinOneCell()) return;
      if (range === null || !grid) return;
      const text = selectionToTsv(grid.rows, range);
      if (!text) return;
      event.preventDefault();
      void navigator.clipboard.writeText(text)
        .catch(() => onError(`Copy is unavailable here. Select and copy this text: ${text}`));
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active, range, grid, onError, containerRef]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      // The grid's keys are its own, and "its own" means the grid has the focus. The listener sits
      // on the window so a key pressed on a row's delete control or a foreign-key cell still moves
      // the highlight, which is why it asks where the focus is rather than taking the target's word
      // for it — without that, an `ArrowUp` in the command bar recalls a statement and moves the
      // highlighted row in the same press.
      const frame = containerRef.current;
      if (!frame?.contains(document.activeElement)) return;
      if (event.key === 'Escape') {
        if (range === null) return;
        event.preventDefault();
        setRange(null);
        return;
      }
      if (!GRID_NAVIGATION_KEYS.has(event.key)) return;
      // A held shift asks for a run of rows rather than the one row, so it is answered with the run
      // extended from where it started and a plain press is answered with the run restarted.
      const row = nextRowSelection(rows, range?.to ?? null, event.key);
      if (row === null) return;
      event.preventDefault();
      setRange((previous) => (event.shiftKey && previous ? rowRange(row, previous) : { from: row, to: row }));
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active, rows, range, containerRef]);

  return {
    range,
    /** Highlight this row, or extend the run in progress to it. */
    selectRow(row: number, extend: boolean) {
      setRange((previous) => rowRange(row, extend ? previous : null));
    },
    clear() { setRange(null); },
    selected(row: number): boolean {
      return range !== null && row >= range.from && row <= range.to;
    },
  };
}
