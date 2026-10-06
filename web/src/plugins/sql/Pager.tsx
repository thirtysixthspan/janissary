import React from 'react';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import { hasNext, hasPrevious, nextOffset, pageLabel, previousOffset } from './grid-view';

// The pager. It shows the same range line the grid's header shows, because the two are the same
// sentence and a user should not have to look in two places to learn how much of the table they are
// looking at — and because the header's line is the one that disappears when the grid scrolls away.
export function Pager({
  payload, onSetPage, onSetPageSize, onRefresh,
}: {
  payload: SqlPayload;
  onSetPage(offset: number): void;
  onSetPageSize(limit: number): void;
  onRefresh(): void;
}) {
  const grid = payload.grid;
  return (
    <div className="sql-pager">
      <button
        type="button"
        disabled={!hasPrevious(grid)}
        onClick={() => onSetPage(previousOffset(grid))}
      >
        Previous
      </button>
      <span className="sql-pager-label">{grid ? pageLabel(grid) : ''}</span>
      <button
        type="button"
        disabled={!hasNext(grid)}
        onClick={() => onSetPage(nextOffset(grid))}
      >
        Next
      </button>
      <label className="sql-page-size">
        Rows
        <select
          value={payload.limit}
          onChange={(event) => onSetPageSize(Number(event.target.value))}
          aria-label="Rows per page"
        >
          {payload.pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" onClick={onRefresh}>Refresh</button>
    </div>
  );
}
