import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
import type { SqlConsoleResult } from '@shared/plugins/sql/shared';

// The statements the tab ran, newest first, above the current one.
//
// This browser is the only surface in the application that mutates data, so it is the only place a
// record of what was written could live — and a user who made three edits and wants to know what
// happened has nothing to read otherwise. A log that kept only successes would not answer that, so a
// failed statement is an entry too.
//
// Each entry copies as its own statement, which is worth doing per entry: a session is lifted one
// statement at a time, not all at once.

/** What one entry reports: how many rows it changed, or the failure that stopped it. */
export function logOutcome(entry: SqlConsoleResult): string {
  if (entry.error) return entry.error;
  if (entry.changed === 0) return 'OK.';
  return `${entry.changed} row${entry.changed === 1 ? '' : 's'} changed.`;
}

export function LogHistory({
  log, copied, onCopy, onClear,
}: {
  log: readonly SqlConsoleResult[];
  copied: string | null;
  onCopy(text: string, name: string): void;
  onClear(): void;
}) {
  return (
    <div className="sql-log">
      <div className="sql-log-head">
        <span className="sql-drawer-label">Earlier statements</span>
        <button type="button" onClick={onClear}>Clear log</button>
      </div>
      <ol className="sql-log-list">
        {log.map((entry, index) => {
          // The name is the statement itself rather than a position: two runs of the same statement
          // are the same statement, and an entry numbered "3" says nothing about which one it is.
          const name = entry.sql;
          return (
            <li key={`${name}-${index}`} className={entry.error ? 'sql-log-entry error' : 'sql-log-entry'}>
              <pre className="sql-log-sql">{name}</pre>
              <span className="sql-log-outcome">{logOutcome(entry)}</span>
              <button
                type="button"
                className="sql-log-copy"
                title="Copy this statement"
                aria-label={`Copy ${name}`}
                onClick={() => onCopy(name, name)}
              >
                <FontAwesomeIcon icon={faCopy} /> {copied === name ? 'Copied' : 'Copy'}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
