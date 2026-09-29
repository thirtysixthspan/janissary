import React from 'react';
import type { SqlStatsColumn } from '@shared/plugins/sql/shared';
import { barScale } from './grid-view';

// The per-column statistics panel: null count, distinct count, min and max for a numeric column, and
// one bar per value for a column with twenty or fewer distinct values. A high-cardinality column
// gets its count and no bars, because twenty thousand bars is not a picture of anything.
//
// Plain flexbox rather than a charting library: the whole panel is a count and a width.
export function StatsPanel({ columns }: { columns: readonly SqlStatsColumn[] }) {
  if (columns.length === 0) {
    return <div className="sql-stats-empty">No statistics yet.</div>;
  }
  return (
    <div className="sql-stats" data-testid="sql-stats">
      {columns.map((column) => <ColumnStats key={column.name} column={column} />)}
    </div>
  );
}

function ColumnStats({ column }: { column: SqlStatsColumn }) {
  const largest = barScale(column);
  return (
    <section className="sql-stats-column">
      <header className="sql-stats-head">
        <span className="sql-stats-name">{column.name}</span>
        <span className="sql-stats-type">{column.type || 'ANY'}</span>
      </header>
      <div className="sql-stats-figures">
        <span>{column.distinct.toLocaleString('en-US')} distinct</span>
        {column.nulls > 0 && <span>{column.nulls.toLocaleString('en-US')} null</span>}
        {column.min !== undefined && <span>min {column.min}</span>}
        {column.max !== undefined && <span>max {column.max}</span>}
      </div>
      {column.values.length > 0 ? (
        <ul className="sql-bars">
          {column.values.map((entry) => (
            <li className="sql-bar" key={entry.label}>
              <span className="sql-bar-label" title={entry.label}>{entry.label}</span>
              <span className="sql-bar-track">
                <span className="sql-bar-fill" style={{ width: `${(entry.count / largest) * 100}%` }} />
              </span>
              <span className="sql-bar-count">{entry.count.toLocaleString('en-US')}</span>
            </li>
          ))}
        </ul>
      ) : column.distinct > column.distinctLimit ? (
        // The threshold is the host's, and it is what separates a column with more values than are
        // worth drawing from one that simply holds none — both arrive here without bars.
        <p className="sql-stats-toomany">Too many distinct values to chart.</p>
      ) : null}
    </section>
  );
}
