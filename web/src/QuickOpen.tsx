import React from 'react';
import type { FuzzyMatchResult } from './fuzzy-match';

type Properties = {
  query: string;
  onChangeQuery: (query: string) => void;
  results: FuzzyMatchResult[];
  selected: number;
  onChangeSelected: (index: number) => void;
  loading: boolean;
  onPick: (relPath: string) => void;
  onClose: () => void;
  commandInputRef: React.RefObject<HTMLTextAreaElement | null>;
};

function QuickOpenRow({ result, selected, onPick }: { result: FuzzyMatchResult; selected: boolean; onPick: () => void }) {
  const basenameStart = result.path.lastIndexOf('/') + 1;
  const dir = result.path.slice(0, Math.max(basenameStart - 1, 0));
  const name = result.path.slice(basenameStart);
  return (
    <div className={`picker-row quick-open-row${selected ? ' selected' : ''}`} onClick={onPick}>
      <span className="quick-open-name">{name}</span>
      {dir && <span className="quick-open-dir">{dir}</span>}
    </div>
  );
}

function quickOpenBody(query: string, loading: boolean, results: FuzzyMatchResult[], selected: number, onPick: (relPath: string) => void): React.ReactNode {
  if (loading) return <div className="picker-row picker-empty">Searching…</div>;
  if (!query.trim()) return <div className="picker-row picker-empty">type to search</div>;
  if (results.length === 0) return <div className="picker-row picker-empty">No matching files</div>;
  return results.map((result, row) => (
    <QuickOpenRow key={result.path} result={result} selected={row === selected} onPick={() => onPick(result.path)} />
  ));
}

// The Cmd+P quick-open overlay: an autofocused input (modeled on `SearchBar`) plus the capped,
// ranked results list (modeled on `TabNavPicker`). Owns its own key handling — Up/Down/Enter/
// Escape never reach the window handler — since, unlike the other pickers, it holds its own text
// input (Decision 6).
export function QuickOpen({ query, onChangeQuery, results, selected, onChangeSelected, loading, onPick, onClose, commandInputRef }: Properties) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'ArrowUp') { e.preventDefault(); onChangeSelected(Math.max(0, selected - 1)); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); onChangeSelected(Math.min(results.length - 1, selected + 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const result = results[selected];
      if (result) onPick(result.path);
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); commandInputRef.current?.focus(); }
  };

  return (
    <div className="picker quick-open" data-doc-shot="quick-open-overlay">
      <div className="command">
        <div className="input-wrap">
          <input
            value={query}
            autoFocus
            spellCheck={false}
            placeholder="Search files by name"
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      {quickOpenBody(query, loading, results, selected, onPick)}
    </div>
  );
}
