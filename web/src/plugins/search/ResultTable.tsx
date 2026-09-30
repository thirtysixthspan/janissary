import React from 'react';
import type { SearchMatch } from '@shared/plugins/search/shared';
import { SearchRow } from './SearchRow';

export type ResultTableProperties = {
  rows: readonly SearchMatch[];
  selected: number | null;
  // Selection and activation are separate gestures, handled by the tab.
  onRowClick(index: number): void;
  onRowDoubleClick(index: number): void;
  state: 'searching' | 'done' | 'error';
  query: string;
  message: string;
};

// The body of the search tab. Three states, one per thing that can be true: a scan is running, a scan
// settled with nothing, or a scan failed. Rows and the searching state coexist, because a scan that
// is still finding matches is showing the ones it has already found.
export function ResultTable({
  rows, selected, onRowClick, onRowDoubleClick, state, query, message,
}: ResultTableProperties) {
  if (rows.length === 0) {
    if (state === 'error') return <div className="search-empty">{message}</div>;
    if (state === 'searching') return <div className="search-empty">Searching…</div>;
    return (
      <div className="search-empty">
        {query.trim() === '' ? 'Type to search' : `No matches found for "${query.trim()}".`}
      </div>
    );
  }
  return (
    <>
      {rows.map((row, index) => (
        <SearchRow
          key={`${row.path}:${row.line}`}
          row={row}
          index={index}
          selected={selected === index}
          onClick={() => { onRowClick(index); }}
          onDoubleClick={() => { onRowDoubleClick(index); }}
        />
      ))}
      {state === 'searching' && <div className="search-empty">Searching…</div>}
    </>
  );
}
