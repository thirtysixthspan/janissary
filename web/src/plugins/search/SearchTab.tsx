import React, { useCallback, useRef } from 'react';
import type { SearchPayload } from '@shared/plugins/search/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ModeToggles } from './ModeToggles';
import { ResultTable } from './ResultTable';
import { SearchBar } from './SearchBar';
import { SearchFilters } from './SearchFilters';
import { useResultSelection } from './useResultSelection';
import { useSearchController } from './useSearchController';

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
  const sendIntent = useCallback((name: 'search' | 'open', body: unknown) => {
    void capabilities.intent(name, body);
  }, [capabilities]);
  const {
    include, exclude, modes, history, query, setQuery,
    onQuerySearched, toggle, changeInclude, changeExclude, onOpen,
  } = useSearchController(payload, sendIntent);
  const rows = payload.rows;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { listRef, selected, navigate, rowClicked } = useResultSelection({ count: rows.length });

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
          onRowClick={rowClicked}
          onRowDoubleClick={onOpen}
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
