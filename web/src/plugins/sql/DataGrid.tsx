import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faFilter as faFilterIcon } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { pageLabel, readOnlyReason, toggleColumn, visibleColumns, type CellPosition } from './grid-view';
import { GridRow } from './GridRow';
import { InsertForm } from './InsertForm';
import { ColumnChooser } from './ColumnChooser';
import { useGridSelection } from './selection';
import { useGridKeys } from './sql-keys';
import { FilterChips, FilterRow, GlobalFilter } from './Filters';
import { Pager } from './Pager';
import { DeleteRowDialog } from './DeleteRowDialog';

// The data grid: the object on screen and one page of its rows. A read-only object keeps the whole
// grid and loses only the write affordances, so a view is still useful when it cannot be edited.
//
// The grid owns no actions. The row above it holds them — the frame's metadata row — so this is the
// facts and the page, and the two forms the row's controls open are rendered here because they are
// about the grid: the insert form is a reviewable statement about the object on screen, and the
// column chooser can only list the columns the statement that ran carries.
export function DataGrid({
  payload, capabilities,
  inserting = false, onInserting = () => {},
  choosingColumns = false, onChoosingColumns = () => {},
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
  /**
   * Whether the metadata row's **Insert row** has the form open, and whether the **Columns** control
   * has the chooser open. Both default closed, which is what a grid with no row above it looks like —
   * the frame that owns the row is the one that opens them, because it is where the controls are.
   */
  inserting?: boolean;
  onInserting?(open: boolean): void;
  choosingColumns?: boolean;
  onChoosingColumns?(open: boolean): void;
}) {
  const object = payload.objects.find((entry) => entry.name === payload.object);
  const [editing, setEditing] = useState<{ row: string; column: string } | null>(null);
  const [deleting, setDeleting] = useState<SqlRow | null>(null);
  const [filtering, setFiltering] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const grid = payload.grid;
  const readOnly = readOnlyReason(object);
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const ordered = payload.order[0];
  // The declared order, minus what the chooser has put away. A hidden column keeps its place in the
  // row, so what is rendered is a list of names and the position each one holds in the cells.
  const shown = visibleColumns(grid?.columns ?? [], payload.hidden);
  const setHidden = (hidden: string[]) => send('set-columns', { hidden });
  const selection = useGridSelection(grid, capabilities, setCopyError);
  // The keyboard cursor, which reads as the selection when no mouse run is in progress — otherwise a
  // user moving by arrow keys would have nothing to see and the cells Enter would open invisible.
  const keys = useGridKeys({
    active: capabilities.active,
    rows: grid?.rows.length ?? 0,
    columns: shown.map((entry) => entry.name),
    onEdit: (at) => {
      const row = grid?.rows[at.row];
      const column = shown[at.cell]?.name;
      if (row && column && object?.writable) setEditing({ row: row.key, column });
    },
    onSelectRow: (row) => selection.selectRow(row, true),
    edgeRow: selection.range?.to.row ?? null,
    onClear: selection.clear,
  });
  const selected = (at: CellPosition) => (selection.range
    ? selection.selected(at)
    : keys.cursor?.row === at.row && keys.cursor?.cell === at.cell);

  return (
    <div className="sql-grid-area">
      <div className="sql-grid-bar">
        <span className="sql-grid-object">{object?.name ?? '—'}</span>
        <span className="sql-grid-count">{grid ? pageLabel(grid) : 'Loading…'}</span>
        {readOnly && <span className="sql-readonly">{readOnly}</span>}
      </div>

      {choosingColumns && (
        <ColumnChooser
          columns={grid?.columns ?? []}
          hidden={payload.hidden}
          onClose={() => onChoosingColumns(false)}
          onToggle={(name) => setHidden(toggleColumn(grid?.columns ?? [], payload.hidden, name))}
          onShowAll={() => setHidden([])}
        />
      )}

      {inserting && object && (
        <InsertForm
          object={object.name}
          columns={object.columns}
          onSave={(cells) => {
            onInserting(false);
            send('insert-row', { object: payload.object, cells });
          }}
          onCancel={() => onInserting(false)}
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
              <th className="sql-gutter sql-row-head" />
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
                position={index}
                shown={shown}
                object={object}
                editingColumn={editing?.row === row.key ? editing.column : null}
                deleting={object?.writable === true}
                selected={selected}
                onSelect={selection.select}
                onSelectRow={(extend) => selection.selectRow(index, extend)}
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
