import React, { useCallback, useRef, useState } from 'react';
import type { SearchIntent, SearchPayload } from '@shared/plugins/search/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ModeToggles, type ModeKey } from './ModeToggles';
import { ResultTable } from './ResultTable';
import { SearchBar } from './SearchBar';
import { SearchFilters } from './SearchFilters';
import { recordSearch } from './search-history';
import { useResultSelection } from './useResultSelection';
import { useSeededQuery } from './useSeededQuery';

// The three query modes, held as client-local view state. The server does not keep them: every
// search carries all three in the intent that starts it, so a rerun always sends the current set.
type Modes = Pick<SearchIntent, 'regex' | 'matchCase' | 'wholeWord'>;

// Read the three mode flags out of a tab payload, and nothing else. A search intent carries the
// query and the modes, so seeding the state from the whole payload would send the tab's rows back to
// the server on the next search.
const modesOf = (value: SearchPayload): Modes => ({
  regex: value.regex, matchCase: value.matchCase, wholeWord: value.wholeWord,
});

// The search tab: a metadata header carrying the include and exclude fields, a result window that
// stacks upward, and the command line at the bottom edge. Everything above the command line is
// output; the command line is where the query goes, and the modifiers sit at its right-hand end.
//
// The bar and the window are the tab's only focusable elements, and this component owns both refs so
// Tab can step between them. Whichever one has focus keeps its own keys — the window the selection
// keys, the bar its caret — because only the focused element receives them.
export function SearchTab({
  payload, capabilities,
}: {
  payload: SearchPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [include, setInclude] = useState(payload.include);
  const [exclude, setExclude] = useState(payload.exclude);
  const [modes, setModes] = useState<Modes>(modesOf(payload));
  // The terms this tab has searched, oldest first, walked by the arrow keys from the command bar. A
  // tab opened by `search <phrase>` has already searched it, so that phrase seeds the list rather
  // than waiting for a keystroke that will never come — and so does a later `search <phrase>` the
  // tab adopts while it is open.
  const [history, setHistory] = useState<string[]>(() => {
    const opened = payload.query.trim();
    return opened === '' ? [] : [opened];
  });
  const adopt = useCallback((term: string) => { setHistory((entries) => recordSearch(entries, term)); }, []);
  const { query, setQuery, isAdoptedEcho } = useSeededQuery(payload, adopt);
  const rows = payload.rows;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { listRef, selected, navigate, rowClicked } = useResultSelection({ count: rows.length });

  // One search, whatever asked for it. Every caller passes the value it is about to hold, rather
  // than this reading state that has not been committed yet — a filter field reruns as it is typed,
  // so the state it would read is always the previous keystroke's.
  const search = useCallback((next: SearchIntent) => {
    void capabilities.intent('search', next);
  }, [capabilities]);

  // A term becomes part of the history in exactly one place — the bar's debounce, which is also the
  // only place a *new* term arrives. Toggling a mode or editing a narrowing field reruns the term
  // already in the bar, and recording that again would only shuffle the list for no reason.
  const onQuerySearched = useCallback((next: string) => {
    if (isAdoptedEcho(next)) return;
    setHistory((entries) => recordSearch(entries, next));
    search({ query: next, include, exclude, ...modes });
  }, [exclude, include, isAdoptedEcho, modes, search]);

  const toggle = (key: ModeKey) => {
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

  // One click goes through the shared list selection, and its own answer says whether the row opens.
  // That is the same arrangement the sessions and conversations lists use, and it is what keeps the
  // focus the selection performs and the open the tab performs from being two independent steps —
  // `rowClicked` focuses the list, which is why clicking a row works at all.
  const onRowClick = useCallback((index: number) => {
    if (rowClicked(index)) onOpen(index);
  }, [onOpen, rowClicked]);

  // Tab steps back to the bar, which is the tab's next focusable element; Shift+Tab is left to the
  // browser, so it keeps walking backwards out of the tab rather than folding into a two-element
  // loop. Checked before the selection keys, none of which answer to Tab.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    if (navigate(event.key)) { event.preventDefault(); return; }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      onOpen(selected);
    }
  };

  const onFocusResults = useCallback(() => { listRef.current?.focus(); }, [listRef]);

  return (
    <div className="plugin-tab search-tab" data-doc-shot="search-tab">
      <div className="plugin-meta">
        <SearchFilters
          include={include}
          exclude={exclude}
          onChangeInclude={changeInclude}
          onChangeExclude={changeExclude}
        />
        {capabilities.splitAction && <span className="plugin-actions">{capabilities.splitAction}</span>}
      </div>
      <div className="search-results" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
        <ResultTable
          rows={rows}
          selected={selected}
          onRowClick={onRowClick}
          state={payload.state}
          query={query}
          message={payload.message}
        />
      </div>
      <SearchBar
        query={query}
        onChangeQuery={setQuery}
        onSearch={onQuerySearched}
        active={capabilities.active}
        trailing={<ModeToggles modes={modes} onToggle={toggle} />}
        label="search"
        inputRef={inputRef}
        onFocusResults={onFocusResults}
        history={history}
      />
    </div>
  );
}
