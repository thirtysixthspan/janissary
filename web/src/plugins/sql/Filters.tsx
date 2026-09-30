import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSearch } from '@fortawesome/free-solid-svg-icons';
import { isFilterOn, type SqlFilterOperator, type SqlPayload } from '@shared/plugins/sql/shared';
import { filterLabel } from './grid-view';

// The filter row and the chips above it. A filter is a column, an operator, and a value, and it is
// set inline under the header it applies to rather than in a dialog — two choices and Enter. Setting
// the same column's filter again the same way removes it, which is what the server-side toggle does.
//
// A chip is also a switch: double-clicking it parks the filter without retyping it, and the parked
// one is drawn greyed out with a tooltip saying which press brings it back. It is a toggle button
// rather than a disabled one, because a disabled button takes no pointer events at all — there would
// be nothing to hover for the tooltip and nothing to press to undo it.
export function FilterChips({
  payload, onSend,
}: {
  payload: SqlPayload;
  onSend(name: string, body: unknown): void;
}) {
  if (payload.filters.length === 0 && payload.global === '') return null;
  return (
    <div className="sql-filters">
      {payload.global !== '' && <span className="sql-filter-chip"><span>matches "{payload.global}" anywhere</span></span>}
      {payload.filters.map((filter) => {
        const on = isFilterOn(filter);
        return (
          <button
            type="button"
            key={filter.column}
            className={`sql-filter-chip sql-filter-toggle${on ? '' : ' off'}`}
            aria-pressed={on}
            title={on ? 'Disable' : 'Enable'}
            onDoubleClick={() => onSend('set-filter-enabled', { column: filter.column, enabled: !on })}
          >
            {filterLabel(filter)}
          </button>
        );
      })}
      <button type="button" className="sql-clear-filters" onClick={() => onSend('clear-filters', {})}>
        <FontAwesomeIcon icon={faFilter} /> Clear filters
      </button>
    </div>
  );
}

/**
 * The one field that matches a term against every column at once.
 *
 * It sits above the per-column chips because it is the other order of narrowing: a per-column filter
 * is asked when the column is known, and this is asked when it is not. Submitting an empty value
 * removes the term rather than filtering for nothing, so clearing it needs no second control — and
 * the server's `clear-filters` takes it away with the rest.
 */
export function GlobalFilter({
  value, onSend,
}: {
  value: string;
  onSend(name: string, body: unknown): void;
}) {
  const [term, setTerm] = useState(value);
  // The payload is the term in force, and a fresh answer replaces what was typed; keeping the
  // local copy in step is what stops the field showing one thing while the grid shows another.
  useEffect(() => setTerm(value), [value]);
  const apply = () => {
    if (term === value) return;
    onSend('set-global-filter', { value: term });
  };
  return (
    <div className="sql-global-filter">
      <FontAwesomeIcon icon={faSearch} />
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          apply();
        }}
        placeholder="Search every column"
        aria-label="Search every column"
      />
      {term !== '' && (
        <button type="button" onClick={() => { setTerm(''); onSend('set-global-filter', { value: '' }); }}>
          Clear
        </button>
      )}
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
      <td className="sql-gutter sql-row-head" />
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
    </tr>
  );
}
