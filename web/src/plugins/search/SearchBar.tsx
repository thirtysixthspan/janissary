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
};

// The search tab's query input: the host's own command bar, so it looks exactly like the agent
// tab's rather than being a second textarea that drifts from it. Composed with no history and no
// ghost, because a search query is not a command this tab remembers.
export function SearchBar({
  query, onChangeQuery, onSearch, active, trailing, label,
}: SearchBarProperties) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bar = useCommandBarKeys({
    value: query, setValue: onChangeQuery, inputRef, history: [], onSubmit: () => {},
  });
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);

  // A tab that opens with a query already in it must not immediately re-run that same query, so the
  // first settled value is remembered and only a change after it fires.
  const settled = useRef(query);
  useEffect(() => {
    if (settled.current === debounced) return;
    settled.current = debounced;
    if (debounced.trim() !== '') onSearch(debounced);
  }, [debounced, onSearch]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  return (
    <CommandBarShell
      value={query}
      onChange={onChangeQuery}
      onKeyDown={bar.onKeyDown}
      inputRef={inputRef}
      autoFocus={active}
      ariaLabel="Search the project"
      trailing={trailing}
      label={label}
    />
  );
}
