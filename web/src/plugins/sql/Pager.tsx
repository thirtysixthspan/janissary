import React, { useState } from 'react';
import type { SqlPayload } from '@shared/plugins/sql/shared';
import { goToRow, hasNext, hasPrevious, nextOffset, pageLabel, previousOffset } from './grid-view';

// The pager. It shows the same range line the grid's header shows, because the two are the same
// sentence and a user should not have to look in two places to learn how much of the table they are
// looking at — and because the header's line is the one that disappears when the grid scrolls away.
export function Pager({
  payload, onSend,
}: {
  payload: SqlPayload;
  onSend(name: string, body: unknown): void;
}) {
  const grid = payload.grid;
  const [row, setRow] = useState('');
  // A row the user can misread as a page: the helper turns it into one, and the range label is
  // left where it is so they can see where they landed rather than having to trust the number.
  const go = () => {
    const offset = goToRow(row, grid);
    if (offset !== null) onSend('set-page', { offset });
  };
  return (
    <div className="sql-pager">
      <button
        type="button"
        disabled={!hasPrevious(grid)}
        onClick={() => onSend('set-page', { offset: previousOffset(grid) })}
      >
        Previous
      </button>
      <span className="sql-pager-label">{grid ? pageLabel(grid) : ''}</span>
      <button
        type="button"
        disabled={!hasNext(grid)}
        onClick={() => onSend('set-page', { offset: nextOffset(grid) })}
      >
        Next
      </button>
      <span className="sql-goto">
        <input
          type="number"
          min={1}
          value={row}
          onChange={(event) => setRow(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            go();
          }}
          aria-label="Go to row"
          placeholder="Row"
        />
        <button type="button" onClick={go} disabled={goToRow(row, grid) === null}>Go</button>
      </span>
      <label className="sql-page-size">
        Rows
        <select
          value={payload.limit}
          onChange={(event) => onSend('set-page-size', { limit: Number(event.target.value) })}
          aria-label="Rows per page"
        >
          {payload.pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => onSend('refresh', {})}>Refresh</button>
    </div>
  );
}
