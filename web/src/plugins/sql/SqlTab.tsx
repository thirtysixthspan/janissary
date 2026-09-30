import React, { useState } from 'react';
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

// A database tab: one metadata row across the full width and one body below it. The row is the shape
// a harness tab draws — the facts on the left, the actions pushed right, a border under the lot —
// rebuilt with the plugin's own class names, because a client plugin may reach only its own api and
// the shared plugin stylesheet.
//
// Docked in a sidebar it is the same tab, narrower. `capabilities.dock` says it is narrow and the
// plugin reads that rather than measuring the host's frame; with one body there is nothing to switch
// between, which is why there is no Schema/Data switch here.
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
  const docked = capabilities.dock !== null;
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
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
        <DatabaseSwitcher payload={payload} onOpen={(name) => send('open', { name })} />
        <TableSwitcher payload={payload} onOpen={(name) => send('select-object', { object: name })} />
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
            onExport={(format) => send('export', { format })}
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
        inserting={inserting}
        onInserting={setInserting}
        choosingColumns={choosingColumns}
        onChoosingColumns={setChoosingColumns}
      />

      <div className="sql-console">
        <SqlConsole
          active={capabilities.active}
          busy={payload.pending !== null}
          value={consoleText}
          onValue={setConsoleText}
          onSend={(sql) => send('run', { sql })}
        />
      </div>
    </div>
  );
}
