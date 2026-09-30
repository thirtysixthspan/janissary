import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSort, faSortUp, faSortDown, faFilter as faFilterIcon } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { countLabel, readOnlyReason, statementResult, toggleColumn, visibleColumns } from './grid-view';
import { GridRow } from './GridRow';
import { InsertForm } from './InsertForm';
import { ColumnChooser } from './ColumnChooser';
import { useGridSelection } from './selection';
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
  frameRef, onEnter = () => {},
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
  /**
   * The scroll frame's ref, when something above the grid needs to focus it — the tab frame, which
   * hands `Tab` from the command bar down to the rows. A grid rendered on its own keeps its own.
   */
  frameRef?: React.RefObject<HTMLDivElement | null>;
  /** Hand focus back to the command bar: a bare `Tab` in the grid returns to the other pane. */
  onEnter?(): void;
}) {
  const object = payload.objects.find((entry) => entry.name === payload.object);
  const [editing, setEditing] = useState<{ row: string; column: string } | null>(null);
  const [deleting, setDeleting] = useState<SqlRow | null>(null);
  const [filtering, setFiltering] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const grid = payload.grid;
  // A statement's result carries no row identity, so the grid is read-only the way a view is and
  // offers no write control at all. One flag decides it, so the reason, the delete affordance, and
  // both routes to an editor cannot disagree about whether this grid can be written to.
  const statement = statementResult(grid);
  const readOnly = readOnlyReason(object, statement);
  const writable = object?.writable === true && !statement;
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const ordered = payload.order[0];
  // The declared order, minus what the chooser has put away. A hidden column keeps its place in the
  // row, so what is rendered is a list of names and the position each one holds in the cells.
  const shown = visibleColumns(grid?.columns ?? [], payload.hidden);
  const setHidden = (hidden: string[]) => send('set-columns', { hidden });
  const ownRef = useRef<HTMLDivElement>(null);
  const scrollRef = frameRef ?? ownRef;
  const selection = useGridSelection({
    grid, active: capabilities.active, containerRef: scrollRef, onError: setCopyError,
  });

  return (
    <div className="sql-grid-area">
      <div className="sql-grid-bar">
        <span className="sql-grid-object">{object?.name ?? '—'}</span>
        <span className="sql-grid-count">{countLabel(payload)}</span>
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

      <div
        className="sql-grid-scroll"
        ref={scrollRef}
        tabIndex={0}
        aria-label="Results"
        onKeyDown={(event) => {
          // A bare `Tab` in the grid comes back to the command bar; a held modifier is the host's and
          // walks out of the plugin tab, which is what it does from anywhere else in it.
          if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          onEnter();
        }}
      >
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
                deleting={writable}
                selected={selection.selected(index)}
                onSelectRow={(extend) => selection.selectRow(index, extend)}
                onEdit={(column) => {
                  if (writable) setEditing({ row: row.key, column });
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
