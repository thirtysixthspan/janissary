import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faPlay } from '@fortawesome/free-solid-svg-icons';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';
import { renderRunnableSql } from './grid-view';

// The generated SQL: the exact statement that produced the grid, and the values bound into it, shown
// as `?` placeholders rather than inlined. Inlining would need to escape a value, and a copy of the
// statement that means something slightly different is worse than one that needs filling in.
export function SqlDrawer({
  payload, capabilities,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statement = payload.grid?.sql;
  const parameters = payload.grid?.parameters ?? [];

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (!statement) return null;

  const copy = async () => {
    const text = `${statement}\n-- Parameters: ${JSON.stringify(parameters)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sql-drawer">
      <pre className="sql-drawer-statement" data-testid="sql-statement">{statement}</pre>
      <div className="sql-drawer-parameters">
        <span className="sql-drawer-label">Parameters</span>
        <code>{JSON.stringify(parameters)}</code>
      </div>
      <div className="sql-drawer-actions">
        <button type="button" onClick={() => { void copy(); }}>
          <FontAwesomeIcon icon={faCopy} /> {copied ? 'Copied' : 'Copy'}
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
