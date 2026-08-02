import React from 'react';
import type { FuzzyMatchResult } from '../fuzzy-match';

type Properties = {
  query: string;
  onChangeQuery: (query: string) => void;
  results: FuzzyMatchResult[];
  selected: number;
  onChangeSelected: (index: number) => void;
  onClose: () => void;
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

function EditorFindRow({ result, selected, onSelect }: { result: FuzzyMatchResult; selected: boolean; onSelect: () => void }) {
  return (
    <div className={`picker-row editor-find-row${selected ? ' selected' : ''}`} onClick={onSelect}>
      <span className="editor-find-line">{result.index + 1}</span>
      <span className="editor-find-text">{highlightRanges(result.path, result.ranges)}</span>
    </div>
  );
}

function editorFindBody(query: string, results: FuzzyMatchResult[], selected: number, onChangeSelected: (index: number) => void): React.ReactNode {
  if (!query.trim()) return <div className="picker-row picker-empty">type to search</div>;
  if (results.length === 0) return <div className="picker-row picker-empty">No matching lines</div>;
  return results.map((result, row) => (
    <EditorFindRow key={result.index} result={result} selected={row === selected} onSelect={() => onChangeSelected(row)} />
  ));
}

// The Cmd+F find overlay for an editor tab: an autofocused input over the ranked buffer lines,
// modeled on `QuickOpen`. Purely presentational — the caret jump that previews the highlighted row
// belongs to `EditorTab`, which owns the buffer. Owns its own key handling so Up/Down/Enter/Escape
// never reach the buffer behind it.
export function EditorFind({ query, onChangeQuery, results, selected, onChangeSelected, onClose }: Properties) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'ArrowUp') { e.preventDefault(); onChangeSelected(Math.max(0, selected - 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); onChangeSelected(Math.min(results.length - 1, selected + 1)); return; }
    // The jump has already happened live, so Enter has nothing left to commit.
    if (e.key === 'Enter') { e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="picker editor-find">
      <div className="command">
        <div className="input-wrap">
          <input
            value={query}
            autoFocus
            spellCheck={false}
            placeholder="Search buffer"
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {editorFindBody(query, results, selected, onChangeSelected)}
    </div>
  );
}
