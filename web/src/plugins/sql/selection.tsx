import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
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
      if (getSelection()?.toString()) return;
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

  /** Put the selection on the system clipboard, or say why it could not be. */
  const copy = () => {
    if (!range || !grid) return;
    const text = selectionToTsv(grid.rows, grid.columns, range.from, range.to);
    if (!text) return;
    // A clipboard a browser has withheld is not a failure the plugin can act on, so the text is
    // surfaced in the error band rather than being silently dropped.
    void navigator.clipboard.writeText(text)
      .catch(() => onError(`Copy is unavailable here. Select and copy this text: ${text}`));
  };

  return {
    range,
    copy,
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

/**
 * The control that copies the selection, disabled when there is none.
 *
 * Present as well as the keyboard route because the toolbar is where a user looks for an action
 * they do not have a shortcut for, and a disabled control answers "is there anything selected"
 * without the user having to try.
 */
export function CopySelectionButton({ onCopy, enabled }: { onCopy(): void; enabled: boolean }) {
  return (
    <button
      type="button"
      className="sql-icon"
      title="Copy selection"
      aria-label="Copy selection"
      disabled={!enabled}
      onClick={onCopy}
    >
      <FontAwesomeIcon icon={faCopy} />
    </button>
  );
}

/** The text a selection is copied as, or an empty string when there is none. */
export function selectionText(
  grid: { columns: string[]; rows: SqlRow[] } | null,
  range: CellRange | null,
): string {
  if (!grid || !range) return '';
  return selectionToTsv(grid.rows, grid.columns, range.from, range.to);
}
