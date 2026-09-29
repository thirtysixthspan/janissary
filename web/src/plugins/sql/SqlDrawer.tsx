import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPlay } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { renderRunnableSql } from './grid-view';
import { LogHistory } from './SqlLog';

// The generated SQL: the exact statement that produced the grid, and the values bound into it, shown
// as `?` placeholders rather than inlined. Inlining would need to escape a value, and a copy of the
// statement that means something slightly different is worse than one that needs filling in.
export function SqlDrawer({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statement = payload.grid?.sql;
  const parameters = payload.grid?.parameters ?? [];
  // Everything before the newest entry is the session rather than the last exchange. It is shown
  // only when there is something to show: a drawer open on a tab that has written nothing should not
  // carry an empty list around.
  const history = payload.log.slice(1);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Copied entries are named rather than flagged, so the confirmation appears beside the statement it
  // is about and two copies in a row do not look like the same one.
  const copy = async (text: string, name: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 3000);
    } catch {
      setCopied(null);
    }
  };

  if (!statement) {
    if (history.length === 0) return null;
    return (
      <div className="sql-drawer">
        <LogHistory log={history} copied={copied} onCopy={copy} onClear={() => { void capabilities.intent('clear-log', {}); }} />
      </div>
    );
  }

  return (
    <div className="sql-drawer">
      {history.length > 0 && (
        <LogHistory log={history} copied={copied} onCopy={copy} onClear={() => { void capabilities.intent('clear-log', {}); }} />
      )}
      <pre className="sql-drawer-statement" data-testid="sql-statement">{statement}</pre>
      <div className="sql-drawer-parameters">
        <span className="sql-drawer-label">Parameters</span>
        <code>{JSON.stringify(parameters)}</code>
      </div>
      <div className="sql-drawer-actions">
        <button type="button" onClick={() => { void copy(`${statement}\n-- Parameters: ${JSON.stringify(parameters)}`, 'current'); }}>
          <FontAwesomeIcon icon={faCopy} /> {copied === 'current' ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          title="Run this statement with the parameters above filled in"
          onClick={() => { void capabilities.intent('run', { sql: renderRunnableSql(statement, parameters) }); }}
        >
          <FontAwesomeIcon icon={faPlay} /> Run
        </button>
      </div>
    </div>
  );
}
