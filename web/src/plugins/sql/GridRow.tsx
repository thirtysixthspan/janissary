import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { SqlCell, SqlColumn, SqlObject, SqlRow } from '@shared/plugins/sql/shared';
import { cellText } from './grid-view';
import { CellEditor } from './CellEditor';
import { startRun } from './selection';

// One row of the grid, and the cell inside it. Both were in `DataGrid.tsx` until the file passed
// the 200-line limit, and both are here because a row is one thing: which cells it shows, whether it
// is highlighted, and what each cell does when it is activated.

/** What a cell missing from the row reads as. */
const NULL_CELL: SqlCell = { text: '', isNull: true };

/** A data cell's classes: a null is drawn in its own style, and the cell being edited is not truncated. */
function cellClass(cell: SqlCell | undefined, editing: boolean): string {
  return ['sql-cell', cell?.isNull ? 'null' : '', editing ? 'editing' : ''].filter(Boolean).join(' ');
}

/**
 * A row: the delete affordance if the object is writable, the header that highlights it, and its
 * cells, in that order from the left.
 *
 * `position` is the row's index in the page, which is what the highlight is expressed in and what the
 * scroll query looks for. `shown` is the visible columns with the position each holds in the row's
 * own cells, because a hidden column still has to be skipped by index rather than by whatever happens
 * to be left in the list.
 */
export function GridRow({
  row, position, shown, object, editingColumn, deleting, selected, onSelectRow, onEdit, onCommit, onCancel, onFollow, onDelete,
}: {
  row: SqlRow;
  position: number;
  shown: readonly { name: string; index: number }[];
  object: SqlObject | undefined;
  // Which column of this row has its editor open, or null when none does: a double click on one
  // cell opens that cell only, and a click on another closes it.
  editingColumn: string | null;
  deleting: boolean;
  /** Whether the run of highlighted rows covers this one. */
  selected: boolean;
  /** Highlight this row, or extend the run in progress to it. */
  onSelectRow(extend: boolean): void;
  onEdit(column: string): void;
  onCommit(column: string, value: string | null): void;
  onCancel(): void;
  onFollow(target: { object: string; column: string; value: string }): void;
  onDelete(): void;
}) {
  return (
    <tr className={selected ? 'selected' : ''} data-row={position}>
      {/* The actions come first, so they are in the same place on every table however wide its
          data is, and on screen without scrolling across to the last column. */}
      <td className="sql-gutter">
        {deleting && (
          <button
            type="button"
            className="sql-icon"
            title="Delete row"
            aria-label="Delete row"
            onClick={onDelete}
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        )}
      </td>
      {/* The row header: it highlights the whole row, and carries no text — the pager already says
          which rows the page holds. */}
      <td
        className="sql-gutter sql-row-head"
        title="Highlight row"
        onMouseDown={(event) => onSelectRow(startRun(event))}
        onMouseEnter={(event) => { if (event.shiftKey) onSelectRow(true); }}
      />
      {shown.map(({ name: column, index: cell }) => (
        <td
          key={column}
          className={cellClass(row.cells[cell], editingColumn === column)}
          // A value too wide for its column is cut off with an ellipsis, so the whole of it is here.
          title={cellText(row.cells[cell] ?? NULL_CELL)}
          // A press anywhere in a row highlights that row, and a second press on the same cell is
          // what opens its editor. The enter handler is the drag case: the mouse button is already
          // down from the mousedown above.
          onMouseDown={(event) => onSelectRow(startRun(event))}
          onMouseEnter={(event) => { if (event.shiftKey) onSelectRow(true); }}
          onDoubleClick={() => onEdit(column)}
        >
          {editingColumn === column ? (
            <CellEditor
              cell={row.cells[cell]}
              onCommit={(value) => onCommit(column, value)}
              onCancel={onCancel}
            />
          ) : (
            <Cell
              column={object?.columns.find((entry) => entry.name === column)}
              cell={row.cells[cell] ?? NULL_CELL}
              onFollow={onFollow}
            />
          )}
        </td>
      ))}
    </tr>
  );
}

/**
 * One cell's contents, and a way to follow a foreign key when the column has one.
 *
 * A keyed column is drawn as a control rather than text: its title names the table and column the
 * value points at, and activating it selects that table filtered to the value. The filter rides
 * inside the selection intent rather than following it — `topicAction` returns nothing, so a second
 * intent sent straight after would be answered against the object the user just left.
 *
 * A null offers nothing, because there is nothing to follow, and so does a reference whose target
 * column could not be resolved: following it would filter on nothing rather than on something.
 */
function Cell({
  column, cell, onFollow,
}: {
  column: SqlColumn | undefined;
  cell: SqlCell;
  onFollow(target: { object: string; column: string; value: string }): void;
}) {
  const reference = column?.references;
  const target = reference ? reference.columns[0] : '';
  if (!reference || !target || cell.isNull) return <>{cellText(cell)}</>;
  return (
    <button
      type="button"
      className="sql-cell-link"
      title={`${reference.table}.${target}`}
      onClick={() => onFollow({ object: reference.table, column: target, value: cell.text })}
    >
      {cellText(cell)}
    </button>
  );
}
