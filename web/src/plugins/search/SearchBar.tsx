import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CommandBarShell, useCommandBarKeys } from '../api';
import { useDebouncedValue } from './useDebouncedValue';

// How long the query rests before a search starts. Long enough that typing a word is one search
// rather than one per keystroke, short enough that the results track what is being typed.
const DEBOUNCE_MS = 200;

export type SearchBarProperties = {
  query: string;
  onChangeQuery: (query: string) => void;
  // Fired once the query has rested, and again whenever a mode toggle or a filter changes — those
  // rerun the same query rather than waiting for more typing.
  onSearch: (query: string) => void;
  active: boolean;
  // The query's modifiers, right-aligned on the command line beside the query they read. The bar
  // carries them without knowing what one is, exactly as the shell carries every other slot.
  trailing: ReactNode;
  // Rendered before the prompt glyph, so the line says what it is — `search >` rather than a bare
  // `>` that is indistinguishable from a shell prompt at a glance.
  label: string;
  // The tab's own ref for the textarea, rather than one of this component's own, so the tab can hold
  // both of its focusable elements by name and step between them.
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  // Move the focus to the results. Taken on a bare Tab: the window is the tab's other focusable
  // element, and without this the bar — the last one in the DOM — hands Tab straight out of the tab.
  onFocusResults(): void;
  // The terms this tab has searched, oldest first. Walked by ArrowUp and ArrowDown, and the source
  // of the inline ghost — one list answering both, which is how the agent bar's history works.
  history: string[];
}

// The search tab's query input: the host's own command bar, so it looks exactly like the agent
// tab's rather than being a second textarea that drifts from it. Composed with the tab's own history
// and the ghost that follows from it, and with no ghost history of its own: a search is answered by
// this tab's own terms, not by every command the application has run.
export function SearchBar({
  query, onChangeQuery, onSearch, active, trailing, label, inputRef, onFocusResults, history,
}: SearchBarProperties) {
  const bar = useCommandBarKeys({
    value: query, setValue: onChangeQuery, inputRef, history, onSubmit: () => {},
  });

  const debounced = useDebouncedValue(query, DEBOUNCE_MS);

  // A tab that opens with a query already in it must not immediately re-run that same query, so the
  // first settled value is remembered and only a change after it fires. An emptied query is sent too,
  // as the empty string: the server answers it with no rows, which is what clears the previous
  // search's results — a bar of only spaces is not a search for spaces.
  const settled = useRef(query);
  useEffect(() => {
    if (settled.current === debounced) return;
    settled.current = debounced;
    onSearch(debounced.trim() === '' ? '' : debounced);
  }, [debounced, onSearch]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active, inputRef]);

  // Tab steps to the results; Shift+Tab is left to the browser, because walking backwards out of the
  // tab is what a user presses it for. Every other key belongs to the bar's own keymap.
  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      onFocusResults();
      return;
    }
    bar.onKeyDown(event);
  };

  return (
    <CommandBarShell
      value={query}
      onChange={onChangeQuery}
      onKeyDown={onKeyDown}
      inputRef={inputRef}
      autoFocus={active}
      ariaLabel="Search the project"
      ghost={bar.ghost}
      trailing={trailing}
      label={label}
    />
  );
}
