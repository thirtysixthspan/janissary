import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDatabase, faDownload, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ColumnChooserButton } from './ColumnChooser';
import { DataGrid } from './DataGrid';
import { DatabaseSwitcher } from './DatabaseSwitcher';
import { ExportButtons } from './ExportButtons';
import { SqlConsole } from './SqlConsole';
import { statementResult } from './grid-view';
import { TableSwitcher } from './TableSwitcher';
import { useSqlActions } from './useSqlActions';

// A database tab: one metadata row across the full width and one body below it. The row is the shape
// a harness tab draws — the facts on the left, the actions pushed right, a border under the lot —
// rebuilt with the plugin's own class names, because a client plugin may reach only its own api and
// the shared plugin stylesheet.
//
// Docked in a sidebar it is the same tab, narrower. `capabilities.dock` says it is narrow and the
// plugin reads that rather than measuring the host's frame; with one body there is nothing to switch
// between, which is why there is no Schema/Data switch here.
//
// `Tab` crosses between the two panes of this tab, and this frame is the only place that knows about
// both of them: the grid hands focus to the console and the console hands it to the grid, and
// neither has to know that the other exists.
export function SqlTab({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  // The console's text lives here rather than in the console, so it survives a re-read of the grid
  // and so a statement the user typed is always something they can read and change before sending.
  const [consoleText, setConsoleText] = useState('');
  // The two forms the row's controls open are the grid's business — one is a statement about the
  // object on screen, the other can only list the columns that statement carried — so the row holds
  // which one is open and the grid draws them.
  const [inserting, setInserting] = useState(false);
  const [choosingColumns, setChoosingColumns] = useState(false);
  const consoleRef = useRef<HTMLTextAreaElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const docked = capabilities.dock !== null;
  const actions = useSqlActions(capabilities);
  // Whichever pane does not have the focus takes it, so `Tab` is a toggle between the two rather
  // than a walk out of the tab. Focus follows the same path a user pressing it twice would take.
  const toGrid = () => { gridRef.current?.focus(); };
  const toConsole = () => { consoleRef.current?.focus(); };
  const object = payload.objects.find((entry) => entry.name === payload.object);
  // A statement's result is read-only the way a view is — there is no row identity in it to write to
  // — so the insert control goes with the rest of the write controls rather than offering a form
  // about a table the grid is not showing.
  const writable = object?.writable === true && !statementResult(payload.grid);


  return (
    <div
      className={`sql-tab${docked ? ' sql-docked' : ''}`}
      data-doc-shot="sql-tab"
      data-docked={docked ? 'true' : 'false'}
    >
      <div className="sql-meta">
        <FontAwesomeIcon icon={faDatabase} className="sql-meta-icon" />
        <DatabaseSwitcher payload={payload} onOpen={actions.open} />
        <TableSwitcher payload={payload} onOpen={actions.selectObject} />
        <span className="sql-meta-actions">
          {writable && (
            <button
              type="button"
              className="sql-icon"
              title="Insert row"
              aria-label="Insert row"
              onClick={() => setInserting(!inserting)}
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          <ColumnChooserButton hiddenCount={payload.hidden.length} onClick={() => setChoosingColumns(!choosingColumns)} />
          <ExportButtons
            enabled={payload.pending === null && object !== undefined}
            onExport={actions.export}
          />
          {/* The finished exports, beside the controls that start one. They are links rather than
              buttons because they are already written: a download with a name and a size. */}
          <span className="sql-exports">
            {payload.exports.map((entry) => (
              <a
                key={entry.name}
                className="sql-export"
                href={capabilities.resourceUrl(entry.ref)}
                download={entry.name}
                title={`${entry.name} — ${entry.rows.toLocaleString('en-US')} rows, ${entry.size}`}
              >
                <FontAwesomeIcon icon={faDownload} /> {entry.name}
              </a>
            ))}
          </span>
          {capabilities.splitAction}
        </span>
      </div>

      <DataGrid
        payload={payload}
        capabilities={capabilities}
        actions={actions}
        inserting={inserting}
        onInserting={setInserting}
        choosingColumns={choosingColumns}
        onChoosingColumns={setChoosingColumns}
        frameRef={gridRef}
        onEnter={toConsole}
      />

      <div className="sql-console">
        <SqlConsole
          active={capabilities.active}
          busy={payload.pending !== null}
          inputRef={consoleRef}
          value={consoleText}
          onValue={setConsoleText}
          onSend={actions.run}
          onLeave={toGrid}
        />
      </div>
    </div>
  );
}
