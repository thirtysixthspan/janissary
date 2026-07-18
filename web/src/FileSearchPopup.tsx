import React from 'react';
import { bestFileMatch, ghostSuffix } from './file-search-match';

type Properties = {
  query: string;
  onChangeQuery: (query: string) => void;
  paths: string[];
  loading: boolean;
  onReveal: (path: string) => void;
  onClose: () => void;
};

// The path/empty/searching line shown below the input (Decisions 4/10): loading beats everything
// else, then an empty query shows nothing, then the top match's path or the no-match placeholder.
function pathLine(loading: boolean, query: string, best: string | undefined): string | null {
  if (loading) return 'Searching…';
  if (!query.trim()) return null;
  return best ?? '(no matching files)';
}

// The file navigator's Search-files pop-up: a single input with an inline ghost completion of the
// top match (editor-style, modeled on `CommandInput`'s ghost-history overlay) and a line below
// showing that match's full root-relative path — no results list (Decision 1). Owns its query
// state's keystrokes and stops their propagation, exactly like `SearchBar`.
export function FileSearchPopup({ query, onChangeQuery, paths, loading, onReveal, onClose }: Properties) {
  const best = bestFileMatch(paths, query);
  const ghost = best ? ghostSuffix(best, query) : undefined;
  const line = pathLine(loading, query, best);
  const display = best !== undefined && line === best ? `> ${line}` : line;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Tab' && ghost) { e.preventDefault(); onChangeQuery(query + ghost); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (best) onReveal(best); return; }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="file-search-popup" data-doc-shot="file-search-popup">
      <div className="command">
        <div className="input-wrap">
          {ghost && (
            <span className="ghost" aria-hidden="true">
              <span className="ghost-typed">{query}</span>{ghost}
            </span>
          )}
          <input
            value={query}
            autoFocus
            spellCheck={false}
            placeholder="Find file…"
            onChange={(e) => onChangeQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onClose}
          />
        </div>
      </div>
      {display !== null && <div className="search-result">{display}</div>}
    </div>
  );
}
