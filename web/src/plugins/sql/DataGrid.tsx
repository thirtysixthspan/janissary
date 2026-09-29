import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faPlus, faFilter as faFilterIcon } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { pageLabel, readOnlyReason, toggleColumn, visibleColumns } from './grid-view';
import { GridRow } from './GridRow';
import { InsertForm } from './InsertForm';
import { ColumnChooser, ColumnChooserButton } from './ColumnChooser';
import { CopySelectionButton, useGridSelection } from './selection';
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
  const [choosingColumns, setChoosingColumns] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const grid = payload.grid;
  const readOnly = readOnlyReason(object);
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const ordered = payload.order[0];
  // The declared order, minus what the chooser has put away. A hidden column keeps its place in the
  // row, so what is rendered is a list of names and the position each one holds in the cells.
  const shown = visibleColumns(grid?.columns ?? [], payload.hidden);
  const setHidden = (hidden: string[]) => send('set-columns', { hidden });
  const selection = useGridSelection(grid, capabilities, setCopyError);

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
              onClick={() => setInserting(true)}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          <CopySelectionButton onCopy={selection.copy} enabled={selection.range !== null} />
          <ColumnChooserButton hiddenCount={payload.hidden.length} onClick={() => setChoosingColumns(!choosingColumns)} />
          {capabilities.splitAction}
        </span>
      </div>

      {choosingColumns && (
        <ColumnChooser
          columns={grid?.columns ?? []}
          hidden={payload.hidden}
          onClose={() => setChoosingColumns(false)}
          onToggle={(name) => setHidden(toggleColumn(grid?.columns ?? [], payload.hidden, name))}
          onShowAll={() => setHidden([])}
        />
      )}

      {inserting && object && (
        <InsertForm
          object={object.name}
          columns={object.columns}
          onSave={(cells) => {
            setInserting(false);
            send('insert-row', { object: payload.object, cells });
          }}
          onCancel={() => setInserting(false)}
        />
      )}

      <GlobalFilter value={payload.global} onSend={send} />

      <FilterChips payload={payload} onSend={send} />

      {payload.error && <div className="sql-error" role="alert">{payload.error}</div>}

      {copyError && (
        <div className="sql-error" role="alert">
          {copyError}
          <button type="button" onClick={() => setCopyError(null)}>Dismiss</button>
        </div>
      )}

      <div className="sql-grid-scroll">
        <table className="sql-grid">
          <thead>
            <tr>
              <th className="sql-gutter" />
              {shown.map(({ name: column }) => (
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
              <GridRow
                key={row.key || index}
                row={row}
                index={index + (grid?.offset ?? 0)}
                position={index}
                shown={shown}
                object={object}
                editingColumn={editing?.row === row.key ? editing.column : null}
                deleting={object?.writable === true}
                selection={selection}
                onEdit={(column) => {
                  if (object?.writable) setEditing({ row: row.key, column });
                }}
                onCommit={(column, value) => {
                  setEditing(null);
                  send('update-cell', { row: row.key, column, value });
                }}
                onCancel={() => setEditing(null)}
                onFollow={(target) => send('select-object', target)}
                onDelete={() => setDeleting(row)}
              />
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
