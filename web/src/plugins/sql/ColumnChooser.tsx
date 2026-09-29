import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faColumns } from '@fortawesome/free-solid-svg-icons';

// The column chooser. A table with forty columns is only usable by horizontal scrolling, and the
// dock and split layouts leave little width to scroll within — so a column can be put out of the way.
//
// Hiding is view state: the statement is untouched, so a hidden column is still selected and still
// filtered. That is what makes "show me the rows" and "show me the columns" separate questions, and
// it is why the menu says which columns are hidden rather than pretending they are gone.
export function ColumnChooser({
  columns, hidden, onClose, onToggle, onShowAll,
}: {
  columns: readonly string[];
  hidden: readonly string[];
  onClose(): void;
  onToggle(name: string): void;
  onShowAll(): void;
}) {
  if (columns.length === 0) return null;
  return (
    <div className="sql-columns" role="group" aria-label="Choose columns">
      {columns.map((name) => (
        <label key={name} className={hidden.includes(name) ? 'sql-column off' : 'sql-column'}>
          <input type="checkbox" checked={!hidden.includes(name)} onChange={() => onToggle(name)} />
          {name}
        </label>
      ))}
      <span className="sql-columns-actions">
        <button type="button" onClick={onShowAll} disabled={hidden.length === 0}>Show all</button>
        <button type="button" onClick={onClose}>Done</button>
      </span>
    </div>
  );
}

/** The control that opens the chooser, for the grid's action bar. */
export function ColumnChooserButton({
  onClick, hiddenCount,
}: {
  onClick(): void;
  hiddenCount: number;
}) {
  return (
    <button
      type="button"
      className="sql-icon"
      title={hiddenCount > 0 ? `Columns (${hiddenCount} hidden)` : 'Columns'}
      aria-label="Choose columns"
      onClick={onClick}
    >
      <FontAwesomeIcon icon={faColumns} />
    </button>
  );
}
