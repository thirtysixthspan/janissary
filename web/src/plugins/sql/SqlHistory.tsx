import React from 'react';
import type { SqlConsoleResult } from '@shared/plugins/sql/shared';

// The statements this tab has run, in the shape of the agent tab's `hist` picker: a titled panel over
// the command line, one row per statement newest first, the selected row marked, and a picked row
// going back into the line rather than executing on the spot.
//
// This browser is the only surface in the application that mutates data, so it is the only place a
// record of what was written could live — and a user who made three edits and wants to know what
// happened has nothing to read otherwise. A log that kept only successes would not answer that, so a
// failed statement is a row too, in the colour a failure is drawn in everywhere else here.

/** What one entry reports: how many rows it changed, or the failure that stopped it. */
export function logOutcome(entry: SqlConsoleResult): string {
  if (entry.error) return entry.error;
  if (entry.changed === 0) return 'OK.';
  return `${entry.changed} row${entry.changed === 1 ? '' : 's'} changed.`;
}

const ROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']);

/**
 * The row a key moves the picker to, or the one it had.
 *
 * The same rule `web/src/shared/list-selection.ts` gives every plugin list — arrow by one, stop at
 * the ends, `Home` and `End` to the ends — written out here because a client plugin may reach only its
 * own api and the shared stylesheet. This panel is one list of rows, so it is that rule rather than
 * an adaptation of it.
 */
export function nextHistoryRow(length: number, selected: number, key: string): number {
  if (length === 0) return 0;
  if (key === 'ArrowDown') return Math.min(selected + 1, length - 1);
  if (key === 'ArrowUp') return Math.max(selected - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return selected;
}

export function SqlHistory({
  log, selected, onPick, onClear,
}: {
  log: readonly SqlConsoleResult[];
  selected: number;
  onPick(sql: string): void;
  onClear(): void;
}) {
  return (
    <div className="sql-history" role="group" aria-label="Statement history">
      <div className="sql-history-title">history</div>
      {log.length === 0
        ? <div className="sql-history-row empty">(no history)</div>
        : log.map((entry, index) => (
          <div
            key={`${entry.sql}-${index}`}
            className={`sql-history-row${index === selected ? ' selected' : ''}${entry.error ? ' error' : ''}`}
            onClick={() => onPick(entry.sql)}
          >
            <span className="sql-history-sql">{entry.sql}</span>
            <span className="sql-history-outcome">{logOutcome(entry)}</span>
          </div>
        ))}
      <div className="sql-history-actions">
        <button type="button" onClick={onClear} disabled={log.length === 0}>Clear log</button>
      </div>
    </div>
  );
}

/** Whether a key belongs to the panel while it is open, which is every key it is modal for. */
export function isHistoryKey(key: string): boolean {
  return ROW_KEYS.has(key) || key === 'Enter' || key === 'Escape';
}
