import { useCallback, useState } from 'react';
import type { SearchIntent, SearchPayload } from '@shared/plugins/search/shared';
import { recordSearch } from './search-history';
import { useSeededQuery } from './useSeededQuery';
import type { ModeKey } from './ModeToggles';

type Modes = Pick<SearchIntent, 'regex' | 'matchCase' | 'wholeWord'>;
type IntentSender = (name: 'search' | 'open', payload: unknown) => void;

const modesOf = (value: SearchPayload): Modes => ({
  regex: value.regex, matchCase: value.matchCase, wholeWord: value.wholeWord,
});

export function useSearchController(payload: SearchPayload, sendIntent: IntentSender) {
  const [include, setInclude] = useState(payload.include);
  const [exclude, setExclude] = useState(payload.exclude);
  const [modes, setModes] = useState<Modes>(modesOf(payload));
  const [history, setHistory] = useState<string[]>(() => {
    const opened = payload.query.trim();
    return opened === '' ? [] : [opened];
  });
  const adopt = useCallback((term: string) => {
    setHistory((entries) => recordSearch(entries, term));
  }, []);
  const { query, setQuery, isAdoptedEcho } = useSeededQuery(payload, adopt);

  const search = useCallback((next: SearchIntent) => {
    sendIntent('search', next);
  }, [sendIntent]);

  const onQuerySearched = useCallback((next: string) => {
    if (isAdoptedEcho(next)) return;
    setHistory((entries) => recordSearch(entries, next));
    search({ query: next, include, exclude, ...modes });
  }, [exclude, include, isAdoptedEcho, modes, search]);

  const toggle = useCallback((key: ModeKey) => {
    const next = { ...modes, [key]: !modes[key] };
    setModes(next);
    search({ query, include, exclude, ...next });
  }, [exclude, include, modes, query, search]);

  const changeInclude = useCallback((value: string) => {
    setInclude(value);
    search({ query, include: value, exclude, ...modes });
  }, [exclude, modes, query, search]);

  const changeExclude = useCallback((value: string) => {
    setExclude(value);
    search({ query, include, exclude: value, ...modes });
  }, [include, modes, query, search]);

  const onOpen = useCallback((index: number) => {
    const row = payload.rows[index];
    if (row === undefined) return;
    sendIntent('open', { path: row.path, line: row.line });
  }, [payload.rows, sendIntent]);

  return {
    include, exclude, modes, history, query, setQuery,
    onQuerySearched, toggle, changeInclude, changeExclude, onOpen,
  };
}
