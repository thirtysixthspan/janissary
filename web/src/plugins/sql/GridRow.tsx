import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { SqlCell, SqlColumn, SqlObject, SqlRow } from '@shared/plugins/sql/shared';
import { cellText } from './grid-view';
import { CellEditor } from './CellEditor';
import type { CellPosition } from './grid-view';

// One row of the grid, and the cell inside it. Both were in `DataGrid.tsx` until the file passed
// the 200-line limit, and both are here because a row is one thing: which cells it shows, whether
// they are selected, and what each one does when it is activated.

/**
 * A row: its cells, and the delete affordance if the object is writable.
 *
 * `position` is the row's index in the page, which is what the selection is expressed in: `row.cells`
 * is positional and `selectionToTsv` reads the page's own array, so a selection handed a table-wide
 * number would point past the end of that array on every page but the first. `shown` is the visible
 * columns with the position each holds in the row's own cells, because a hidden column still has to be
 * skipped by index rather than by whatever happens to be left in the list.
 */
export function GridRow({
  row, position, shown, object, editingColumn, deleting, selected, onSelect, onEdit, onCommit, onCancel, onFollow, onDelete,
}: {
  row: SqlRow;
  position: number;
  shown: readonly { name: string; index: number }[];
  object: SqlObject | undefined;
  // Which column of this row has its editor open, or null when none does: a double click on one
  // cell opens that cell only, and a click on another closes it.
  editingColumn: string | null;
  deleting: boolean;
  /** Whether this cell is the one the run or the keyboard cursor is on. */
  selected(at: CellPosition): boolean;
  /** Start a run at a cell, or extend the one in progress when `extend` is held. */
  onSelect(at: CellPosition, extend: boolean): void;
  onEdit(column: string): void;
  onCommit(column: string, value: string | null): void;
  onCancel(): void;
  onFollow(target: { object: string; column: string; value: string }): void;
  onDelete(): void;
}) {
  return (
    <tr>
      {shown.map(({ name: column, index: cell }) => (
        <td
          key={column}
          className={[
            row.cells[cell]?.isNull ? 'sql-cell null' : 'sql-cell',
            selected({ row: position, cell }) ? 'selected' : '',
          ].join(' ')}
          // A run starts at this cell, or extends the one in progress when shift is held. The enter
          // handler is the drag case: the mouse button is already down from the mousedown above.
          onMouseDown={(event) => onSelect({ row: position, cell }, event.shiftKey)}
          onMouseEnter={(event) => { if (event.shiftKey) onSelect({ row: position, cell }, true); }}
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
              cell={row.cells[cell] ?? { text: '', isNull: true }}
              onFollow={onFollow}
            />
          )}
        </td>
      ))}
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
