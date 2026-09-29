import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faTrash, faPlus, faFilter as faFilterIcon } from '@fortawesome/free-solid-svg-icons';
import type { SqlCell, SqlColumn, SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { cellText, pageLabel, readOnlyReason } from './grid-view';
import { CellEditor } from './CellEditor';
import { FilterChips, FilterRow, GlobalFilter } from './Filters';
import { Pager } from './Pager';
import { DeleteRowDialog } from './DeleteRowDialog';

// The data grid: a filter row under the column headers, one page of rows, and a pager. A read-only
// object keeps the whole grid and loses only the write affordances, so a view is still useful when
// it cannot be edited.
export function DataGrid({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const object = payload.objects.find((entry) => entry.name === payload.object);
  const [editing, setEditing] = useState<{ row: string; column: string } | null>(null);
  const [deleting, setDeleting] = useState<SqlRow | null>(null);
  const [filtering, setFiltering] = useState<string | null>(null);
  const grid = payload.grid;
  const readOnly = readOnlyReason(object);
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const ordered = payload.order[0];

  return (
    <div className="sql-grid-area">
      <div className="sql-grid-bar">
        <span className="sql-grid-object">{object?.name ?? '—'}</span>
        <span className="sql-grid-count">{grid ? pageLabel(grid) : 'Loading…'}</span>
        {readOnly && <span className="sql-readonly">{readOnly}</span>}
        <span className="sql-grid-actions">
          {object?.writable && (
            <button
              type="button"
              className="sql-icon"
              title="Insert row"
              aria-label="Insert row"
              onClick={() => send('insert-row', {
                object: payload.object,
                cells: object.columns.map((column) => ({ column: column.name, value: null })),
              })}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          {capabilities.splitAction}
        </span>
      </div>

      <GlobalFilter value={payload.global} onSend={send} />

      <FilterChips payload={payload} onSend={send} />

      {payload.error && <div className="sql-error" role="alert">{payload.error}</div>}

      <div className="sql-grid-scroll">
        <table className="sql-grid">
          <thead>
            <tr>
              <th className="sql-gutter" />
              {(grid?.columns ?? []).map((column) => (
                <th key={column} scope="col">
                  <span className="sql-head">
                    <button
                      type="button"
                      className="sql-head-name"
                      title={`Order by ${column}`}
                      onClick={() => send('set-order', { column })}
                    >
                      {column}
                      <FontAwesomeIcon
                        icon={ordered?.column === column ? (ordered.desc ? faSortDown : faSortUp) : faSort}
                        className={ordered?.column === column ? 'sql-sort active' : 'sql-sort'}
                      />
                    </button>
                    <button
                      type="button"
                      className="sql-head-filter"
                      title={`Filter ${column}`}
                      aria-label={`Filter ${column}`}
                      onClick={() => setFiltering(filtering === column ? null : column)}
                    >
                      <FontAwesomeIcon icon={faFilterIcon} />
                    </button>
                  </span>
                </th>
              ))}
              <th className="sql-gutter" />
            </tr>
            {filtering !== null && (
              <FilterRow
                column={filtering}
                payload={payload}
                onClose={() => setFiltering(null)}
                onSend={send}
              />
            )}
          </thead>
          <tbody>
            {(grid?.rows ?? []).map((row, index) => (
              <tr key={row.key || index}>
                <td className="sql-gutter">{index + 1 + (grid?.offset ?? 0)}</td>
                {(grid?.columns ?? []).map((column, cell) => (
                  <td
                    key={column}
                    className={row.cells[cell]?.isNull ? 'sql-cell null' : 'sql-cell'}
                    onDoubleClick={() => {
                      if (object?.writable) setEditing({ row: row.key, column });
                    }}
                  >
                    {editing?.row === row.key && editing.column === column ? (
                      <CellEditor
                        cell={row.cells[cell]}
                        onCommit={(value) => {
                          setEditing(null);
                          send('update-cell', { row: row.key, column, value });
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <Cell
                        column={object?.columns.find((entry) => entry.name === column)}
                        cell={row.cells[cell] ?? { text: '', isNull: true }}
                        onFollow={(target) => send('select-object', target)}
                      />
                    )}
                  </td>
                ))}
                <td className="sql-gutter">
                  {object?.writable && (
                    <button
                      type="button"
                      className="sql-icon"
                      title="Delete row"
                      aria-label="Delete row"
                      onClick={() => setDeleting(row)}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {grid && grid.rows.length === 0 && !payload.error && (
              <tr>
                <td className="sql-empty" colSpan={(grid.columns.length || 1) + 2}>No rows.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager payload={payload} onSend={send} />

      {deleting && (
        <DeleteRowDialog
          object={payload.object}
          onConfirm={() => {
            send('delete-row', { row: deleting.key });
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
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
