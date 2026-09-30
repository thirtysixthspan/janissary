import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faDatabase, faDownload } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { DataGrid } from './DataGrid';
import { DatabaseSwitcher } from './DatabaseSwitcher';
import { SchemaNavigator } from './SchemaNavigator';
import { SqlConsole } from './SqlConsole';
import { StatsPanel } from './StatsPanel';

type Drawer = 'none' | 'stats';

// A database tab. In the centre it is the schema navigator beside the grid; docked in a sidebar it
// is one narrow column with a Schema/Data switch, because `capabilities.dock` says it is narrow and
// the plugin reads that rather than measuring the host's frame.
export function SqlTab({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [showSchema, setShowSchema] = useState(false);
  const [drawer, setDrawer] = useState<Drawer>('none');
  // The console's text lives here rather than in the console, so a statement picked out of the history
  // can be put in the field for the user to change before they send it, rather than running on the
  // spot the way a copy would.
  const [consoleText, setConsoleText] = useState('');
  const docked = capabilities.dock !== null;
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const grid = <DataGrid payload={payload} capabilities={capabilities} />;
  const navigator = <SchemaNavigator payload={payload} capabilities={capabilities} />;
  // The log's newest entry is the last statement run, which is what the line under the prompt reports.
  // It is not a separate field: one list means the line and the history cannot disagree.
  const latest = payload.log[0] ?? null;

  return (
    <div
      className={`sql-tab${docked ? ' sql-docked' : ''}`}
      data-doc-shot="sql-tab"
      data-docked={docked ? 'true' : 'false'}
    >
      <div className="sql-header">
        <FontAwesomeIcon icon={faDatabase} className="sql-header-icon" />
        <DatabaseSwitcher payload={payload} onOpen={(name) => send('open', { name })} />
        {docked && (
          <span className="sql-switch" role="group" aria-label="View">
            <button
              type="button"
              className={showSchema ? 'active' : ''}
              aria-pressed={showSchema}
              onClick={() => setShowSchema(true)}
            >
              Schema
            </button>
            <button
              type="button"
              className={showSchema ? '' : 'active'}
              aria-pressed={!showSchema}
              onClick={() => setShowSchema(false)}
            >
              Data
            </button>
          </span>
        )}
        <span className="sql-header-actions">
          <button
            type="button"
            className="sql-icon"
            title="Stats"
            aria-label="Toggle statistics"
            aria-pressed={drawer === 'stats'}
            onClick={() => {
              if (drawer !== 'stats') send('stats', { object: payload.object });
              setDrawer(drawer === 'stats' ? 'none' : 'stats');
            }}
          >
            <FontAwesomeIcon icon={faChartBar} />
          </button>
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

      {docked ? (showSchema ? navigator : grid) : (
        <div className="sql-body">
          <div className="sql-nav-pane">{navigator}</div>
          <div className="sql-grid-pane">{grid}</div>
        </div>
      )}

      {drawer === 'stats' && <StatsPanel columns={payload.stats ?? []} />}

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
        {latest && (
          <div className={`sql-console-result${latest.error ? ' error' : ''}`}>
            {latest.error ?? 'OK.'}
          </div>
        )}
      </div>
    </div>
  );
}
