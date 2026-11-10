import React from 'react';
import { rankedOverlayKeys } from '../ranked-overlay-keys';
import type { FuzzyMatchResult } from '../fuzzy-match';

type Properties = {
  query: string;
  onChangeQuery: (query: string) => void;
  results: FuzzyMatchResult[];
  selected: number;
  onChangeSelected: (index: number) => void;
  onClose: () => void;
  onEnter?: () => void;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  rowLabel?: (result: FuzzyMatchResult) => React.ReactNode;
  status?: string;
  announcement?: string;
};

// Split `text` into alternating plain and `<mark>`ed segments from the matcher's ranges — the
// generalization of `TabNavPicker`'s `highlightLabel` from one substring to many.
function highlightRanges(text: string, ranges: [number, number][]): React.ReactNode {
  if (ranges.length === 0) return text;
  const segments: React.ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) segments.push(text.slice(at, start));
    segments.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) segments.push(text.slice(at));
  return segments;
}

type RowProperties = {
  result: FuzzyMatchResult;
  selected: boolean;
  onSelect: () => void;
  rowLabel?: (result: FuzzyMatchResult) => React.ReactNode;
};

function LineFindRow({ result, selected, onSelect, rowLabel }: RowProperties) {
  return (
    <div
      className={`picker-row editor-find-row${selected ? ' selected' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="editor-find-line">{rowLabel ? rowLabel(result) : result.index + 1}</span>
      <span className="editor-find-text">{highlightRanges(result.path, result.ranges)}</span>
    </div>
  );
}

function editorFindBody(
  query: string,
  results: FuzzyMatchResult[],
  selected: number,
  onChangeSelected: (index: number) => void,
  rowLabel?: (result: FuzzyMatchResult) => React.ReactNode,
  status?: string,
): React.ReactNode {
  if (!query.trim()) return <div className="picker-row picker-empty">type to search</div>;
  const statusRow = status ? <div className="picker-row picker-empty">{status}</div> : null;
  if (results.length === 0) return statusRow ?? <div className="picker-row picker-empty">No matching lines</div>;
  return (
    <>
      {results.map((result, row) => (
        <LineFindRow key={result.index} result={result} selected={row === selected} onSelect={() => onChangeSelected(row)} rowLabel={rowLabel} />
      ))}
      {statusRow}
    </>
  );
}

// The Cmd+F find overlay over a tab's lines (an editor buffer, a shell transcript): an autofocused
// input over the ranked lines, modeled on `QuickOpen`. Purely presentational — revealing the
// highlighted row belongs to the tab that owns the lines. Owns its own key handling so
// Up/Down/Enter/Escape never reach the surface behind it.
export function LineFind({ query, onChangeQuery, results, selected, onChangeSelected, onClose, onEnter, placeholder, inputRef, rowLabel, status, announcement }: Properties) {
  const rankedKeys = rankedOverlayKeys(selected, results.length, onChangeSelected, onEnter ?? (() => {
    if (results.length > 0) onChangeSelected(0);
  }), onClose);
  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.select();
      return;
    }
    rankedKeys(event);
  };

  return (
    <div className="picker editor-find">
      <div className="command">
        <div className="input-wrap">
          <input
            ref={inputRef}
            value={query}
            autoFocus
            spellCheck={false}
            placeholder={placeholder}
            aria-label={placeholder}
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {announcement !== undefined && (
        <div className="editor-find-announcement" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
      )}
      {editorFindBody(query, results, selected, onChangeSelected, rowLabel, status)}
    </div>
  );
}
