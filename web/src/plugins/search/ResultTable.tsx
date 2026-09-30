import React from 'react';
import type { SearchMatch } from '@shared/plugins/search/shared';

export type ResultTableProperties = {
  rows: readonly SearchMatch[];
  selected: number | null;
  // A click on the row at this index. The selection and the open are the handler's business, so the
  // table reports the click and holds no opinion about either.
  onRowClick(index: number): void;
  state: 'searching' | 'done' | 'error';
  query: string;
  message: string;
};

function ContextLine({ text, line }: { text: string; line: number }) {
  return (
    <div className="search-line search-context">
      <span className="search-lineno">{line}</span>
      <span className="search-text">{text}</span>
    </div>
  );
}

// One match: a dimmed header carrying the file path and the line the match is on, then the two
// display lines of context above it, the match itself, and the two below. The context carries its
// own line numbers, derived from the header's and the position within the block, so a reader can
// see where every line sits without the server sending five numbers per row to draw one.
//
// The two context lines are buffer lines, and a buffer line long enough to wrap becomes two or more
// display lines — so each side sits in its own block that the stylesheet caps at two display lines.
// The server's two buffer lines are the upper bound, and always enough to fill two display lines,
// because a narrower pane wraps a line sooner rather than later.
function SearchRow({ row, index, selected, onClick }: {
  row: SearchMatch; index: number; selected: boolean; onClick: () => void;
}) {
  const first = row.line - row.above.length;
  return (
    <div
      className={`search-row${selected ? ' selected' : ''}`}
      data-index={index}
      role="button"
      tabIndex={-1}
      onClick={onClick}
    >
      <div className="search-row-header">
        <span className="search-row-path">{row.path}</span>
        <span className="search-row-line">{row.line}</span>
      </div>
      <div className="search-context-block search-context-above">
        {row.above.map((text, offset) => (
          <ContextLine key={first + offset} text={text} line={first + offset} />
        ))}
      </div>
      <div className="search-line search-hit">
        <span className="search-lineno">{row.line}</span>
        <span className="search-text">{row.match}</span>
      </div>
      <div className="search-context-block search-context-below">
        {row.below.map((text, offset) => (
          <ContextLine key={row.line + 1 + offset} text={text} line={row.line + 1 + offset} />
        ))}
      </div>
    </div>
  );
}

// The body of the search tab. Three states, one per thing that can be true: a scan is running, a scan
// settled with nothing, or a scan failed. Rows and the searching state coexist, because a scan that
// is still finding matches is showing the ones it has already found.
export function ResultTable({
  rows, selected, onRowClick, state, query, message,
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
        />
      ))}
      {state === 'searching' && <div className="search-empty">Searching…</div>}
    </>
  );
}
