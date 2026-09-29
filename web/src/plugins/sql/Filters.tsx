import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter } from '@fortawesome/free-solid-svg-icons';
import type { SqlFilterOperator, SqlPayload } from '@shared/plugins/sql/shared';
import { filterLabel } from './grid-view';

// The filter row and the chips above it. A filter is a column, an operator, and a value, and it is
// set inline under the header it applies to rather than in a dialog — two choices and Enter. Setting
// the same column's filter again the same way removes it, which is what the server-side toggle does.
export function FilterChips({
  payload, onSend,
}: {
  payload: SqlPayload;
  onSend(name: string, body: unknown): void;
}) {
  if (payload.filters.length === 0) return null;
  return (
    <div className="sql-filters">
      {payload.filters.map((filter) => (
        <span className="sql-filter-chip" key={filter.column}>
          <span>{filterLabel(filter)}</span>
        </span>
      ))}
      <button type="button" className="sql-clear-filters" onClick={() => onSend('clear-filters', {})}>
        <FontAwesomeIcon icon={faFilter} /> Clear filters
      </button>
    </div>
  );
}

const OPERATORS: SqlFilterOperator[] = ['contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'isNull', 'notNull'];

/** One column's filter editor. `isNull` and `notNull` bind nothing, so they hide the value field. */
export function FilterRow({
  column, payload, onClose, onSend,
}: {
  column: string;
  payload: SqlPayload;
  onClose(): void;
  onSend(name: string, body: unknown): void;
}) {
  const [op, setOp] = useState<SqlFilterOperator>('contains');
  const [value, setValue] = useState('');
  const binds = op !== 'isNull' && op !== 'notNull';
  const apply = () => {
    onSend('set-filter', binds ? { column, op, value } : { column, op });
    onClose();
  };
  return (
    <tr className="sql-filter-row">
      <td className="sql-gutter" />
      <td colSpan={Math.max(1, payload.grid?.columns.length ?? 1)}>
        <div className="sql-filter-editor">
          <strong>{column}</strong>
          <select
            value={op}
            onChange={(event) => setOp(event.target.value as SqlFilterOperator)}
            aria-label={`${column} operator`}
          >
            {OPERATORS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {binds && (
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                apply();
              }}
              aria-label={`${column} value`}
            />
          )}
          <button type="button" onClick={apply}>Apply</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </td>
      <td className="sql-gutter" />
    </tr>
  );
}
