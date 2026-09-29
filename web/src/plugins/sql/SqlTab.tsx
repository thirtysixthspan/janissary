import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faCode, faDatabase, faDownload } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { DataGrid } from './DataGrid';
import { SchemaNavigator } from './SchemaNavigator';
import { SqlConsole } from './SqlConsole';
import { SqlDrawer } from './SqlDrawer';
import { StatsPanel } from './StatsPanel';

type Drawer = 'none' | 'sql' | 'stats';

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
  // The console's text lives here rather than in the console, so the drawer's Run can leave a
  // statement in it as well as send it. Both halves go through one handler, so what the field shows
  // and what ran are the same string rather than two call sites agreeing to be.
  const [consoleText, setConsoleText] = useState('');
  const docked = capabilities.dock !== null;
  const send = (name: string, body: unknown) => { void capabilities.intent(name, body); };
  const run = (sql: string) => { setConsoleText(sql); send('run', { sql }); };
  const grid = <DataGrid payload={payload} capabilities={capabilities} />;
  const navigator = <SchemaNavigator payload={payload} capabilities={capabilities} />;
  // The log's newest entry is the last statement run, which is what the line under the prompt
  // reports. It is not a separate field: one list means the line and the history cannot disagree.
  const latest = payload.log[0] ?? null;

  return (
    <div
      className={`sql-tab${docked ? ' sql-docked' : ''}`}
      data-doc-shot="sql-tab"
      data-docked={docked ? 'true' : 'false'}
    >
      <div className="sql-header">
        <FontAwesomeIcon icon={faDatabase} className="sql-header-icon" />
        <select
          className="sql-database"
          value={payload.database}
          onChange={(event) => send('open', { name: event.target.value })}
          aria-label="Database"
        >
          {payload.databases.length === 0 && <option value={payload.database}>{payload.database}</option>}
          {payload.databases.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}{entry.open ? ' •' : ''}
            </option>
          ))}
        </select>
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
            title="SQL"
            aria-label="Toggle generated SQL"
            aria-pressed={drawer === 'sql'}
            onClick={() => setDrawer(drawer === 'sql' ? 'none' : 'sql')}
          >
            <FontAwesomeIcon icon={faCode} />
          </button>
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

      {drawer === 'sql' && <SqlDrawer payload={payload} capabilities={capabilities} onRun={run} />}
      {drawer === 'stats' && <StatsPanel columns={payload.stats ?? []} />}

      <div className="sql-console">
        <SqlConsole
          active={capabilities.active}
          busy={payload.pending !== null}
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
