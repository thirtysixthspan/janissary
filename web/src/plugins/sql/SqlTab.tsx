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
import { logOutcome } from './SqlHistory';
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
  // The console's text lives here rather than in the console, so a statement picked out of the history
  // can be put in the field for the user to change before they send it, rather than running on the
  // spot the way a copy would.
  const [consoleText, setConsoleText] = useState('');
  // The two forms the row's controls open are the grid's business — one is a statement about the
  // object on screen, the other can only list the columns that statement carried — so the row holds
  // which one is open and the grid draws them.
  const [inserting, setInserting] = useState(false);
  const [choosingColumns, setChoosingColumns] = useState(false);
  const docked = capabilities.dock !== null;
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  // The log's newest entry is the last statement run, and the line under the prompt says how it
  // went — the outcome rule is the history's own, so the two cannot disagree. It says nothing about
  // a statement that failed: a failure is a notification, and this line is where the next thing typed
  // goes. It is not a separate field either: one list means the line and the history agree.
  const latest = payload.log[0] ?? null;
  const object = payload.objects.find((entry) => entry.name === payload.object);

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
          {object?.writable && (
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
          log={payload.log}
          onClearLog={() => send('clear-log', {})}
          value={consoleText}
          onValue={setConsoleText}
          onSend={(sql) => send('run', { sql })}
        />
        {latest && !latest.error && (
          <div className="sql-console-result">
            {logOutcome(latest)}
          </div>
        )}
      </div>
    </div>
  );
}
