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
  payload, capabilities, onRun,
}: {
  payload: SqlPayload;
  capabilities: TabPluginClientCapabilities;
  /** Send a statement and leave it in the console, so it is there to adjust. */
  onRun(sql: string): void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statement = payload.grid?.sql;
  const parameters = payload.grid?.parameters ?? [];
  // Every statement the tab has run, the newest first. The console's line under the prompt reports
  // the newest entry's outcome without being asked for it, but the statement itself belongs here too:
  // a log that starts at the second-newest leaves the statement a user has just run nowhere they can
  // read or copy it, which is the only record this browser keeps of what it wrote.
  const log = payload.log;

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
    if (log.length === 0) return null;
    return (
      <div className="sql-drawer">
        <LogHistory log={log} copied={copied} onCopy={copy} onClear={() => { void capabilities.intent('clear-log', {}); }} />
      </div>
    );
  }

  return (
    <div className="sql-drawer">
      {log.length > 0 && (
        <LogHistory log={log} copied={copied} onCopy={copy} onClear={() => { void capabilities.intent('clear-log', {}); }} />
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
          onClick={() => onRun(renderRunnableSql(statement, parameters))}
        >
          <FontAwesomeIcon icon={faPlay} /> Run
        </button>
      </div>
    </div>
  );
}
