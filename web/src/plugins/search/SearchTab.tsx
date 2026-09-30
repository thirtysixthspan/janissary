import React, { useCallback, useState } from 'react';
import type { SearchIntent, SearchPayload } from '@shared/plugins/search/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ResultTable } from './ResultTable';
import { SearchBar } from './SearchBar';
import { useResultSelection } from './useResultSelection';

type Toggle = { key: 'regex' | 'matchCase' | 'wholeWord'; label: string; title: string };

const TOGGLES: Toggle[] = [
  { key: 'regex', label: '.*', title: 'Regular expression' },
  { key: 'matchCase', label: 'Aa', title: 'Match case' },
  { key: 'wholeWord', label: 'W', title: 'Whole word' },
];

// The three query modes, held as client-local view state. The server does not keep them: every
// search carries all three in the intent that starts it, so a rerun always sends the current set.
type Modes = Pick<SearchIntent, 'regex' | 'matchCase' | 'wholeWord'>;

// Read the three mode flags out of a tab payload, and nothing else. A search intent carries the
// query and the modes, so seeding the state from the whole payload would send the tab's rows back to
// the server on the next search.
const modesOf = (value: SearchPayload): Modes => ({
  regex: value.regex, matchCase: value.matchCase, wholeWord: value.wholeWord,
});

// The search tab: a metadata header carrying the mode toggles, the include and exclude fields, the
// search bar, and the result table. Everything above the table is input; the table is the output, and
// it is the only thing that is focusable — the bar keeps its own arrows for caret movement, and the
// table keeps the selection keys, because only the focused element receives them.
export function SearchTab({
  payload, capabilities,
}: {
  payload: SearchPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [query, setQuery] = useState(payload.query);
  const [include, setInclude] = useState(payload.include);
  const [exclude, setExclude] = useState(payload.exclude);
  const [modes, setModes] = useState<Modes>(modesOf(payload));
  const rows = payload.rows;
  const { listRef, selected, navigate, rowClicked } = useResultSelection({ count: rows.length });

  // One search, whatever asked for it. Every caller passes the value it is about to hold, rather
  // than this reading state that has not been committed yet — a filter field reruns as it is typed,
  // so the state it would read is always the previous keystroke's.
  const search = useCallback((next: SearchIntent) => {
    void capabilities.intent('search', next);
  }, [capabilities]);

  const toggle = (key: Toggle['key']) => {
    const next = { ...modes, [key]: !modes[key] };
    setModes(next);
    search({ query, include, exclude, ...next });
  };

  const changeInclude = (value: string) => {
    setInclude(value);
    search({ query, include: value, exclude, ...modes });
  };

  const changeExclude = (value: string) => {
    setExclude(value);
    search({ query, include, exclude: value, ...modes });
  };

  const onOpen = useCallback((index: number) => {
    const row = rows[index];
    if (row === undefined) return;
    void capabilities.intent('open', { path: row.path, line: row.line });
  }, [capabilities, rows]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (navigate(event.key)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      onOpen(selected);
    }
  };

  return (
    <div className="plugin-tab search-tab" data-doc-shot="search-tab">
      <div className="plugin-meta">
        <span className="search-toggles">
          {TOGGLES.map((toggle_) => (
            <button
              key={toggle_.key}
              type="button"
              className={modes[toggle_.key] ? 'on' : ''}
              title={toggle_.title}
              aria-label={toggle_.title}
              aria-pressed={modes[toggle_.key]}
              onClick={() => toggle(toggle_.key)}
            >
              {toggle_.label}
            </button>
          ))}
        </span>
        {capabilities.splitAction && <span className="plugin-actions">{capabilities.splitAction}</span>}
      </div>
      <div className="search-filters">
        <input
          value={include}
          spellCheck={false}
          placeholder="Files to include"
          aria-label="Files to include"
          onChange={(event) => changeInclude(event.target.value)}
        />
        <input
          value={exclude}
          spellCheck={false}
          placeholder="Files to exclude"
          aria-label="Files to exclude"
          onChange={(event) => changeExclude(event.target.value)}
        />
      </div>
      <SearchBar
        query={query}
        onChangeQuery={setQuery}
        onSearch={(next) => search({ query: next, include, exclude, ...modes })}
        active={capabilities.active}
      />
      <div className="search-results" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
        <ResultTable
          rows={rows}
          selected={selected}
          onOpen={onOpen}
          onSelect={(index) => { rowClicked(index); }}
          state={payload.state}
          query={query}
          message={payload.message}
        />
      </div>
    </div>
  );
}
