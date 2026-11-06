// State for a tab's Cmd+F find overlay (the editor buffer's, the shell transcript's): the open
// flag, the query, the capped ranked results, and the highlighted row. Mirrors `useQuickOpen`'s
// surface minus everything about loading and fetching — the candidates are the tab's own lines,
// already in memory, so in an editor a match can be on text that has never been written to disk.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { contiguousMatch, type FuzzyMatchResult } from '../fuzzy-match';

const RESULT_CAP = 10;

export type LineFindApi = {
  findOpen: boolean;
  query: string;
  results: FuzzyMatchResult[];
  selected: number;
  open: (initialQuery?: string) => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelected: (index: number) => void;
};

export function useLineFind(lines: string[] | null, active: boolean): LineFindApi {
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selected, setSelected] = useState(0);

  // Not deferred, unlike `useQuickOpen`: one file's lines are orders of magnitude fewer than a
  // project's file list, and each candidate needs only a contiguous substring check.
  const results = useMemo<FuzzyMatchResult[]>(
    () => (findOpen && lines ? contiguousMatch(lines, query, RESULT_CAP) : []),
    [findOpen, lines, query],
  );

  // Clamp whenever the result list changes shape — a live reload or an edit behind the overlay can
  // shrink it under the highlighted row.
  useEffect(() => {
    setSelected((previous) => Math.min(previous, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Leaving the tab closes the overlay; the tab stays mounted across tab switches, so this
  // reacts to `active` going false rather than to an unmount.
  useEffect(() => {
    if (!active) setFindOpen(false);
  }, [active]);

  const open = useCallback((initialQuery = '') => {
    setQueryState(initialQuery);
    setSelected(0);
    setFindOpen(true);
  }, []);

  const close = useCallback(() => setFindOpen(false), []);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setSelected(0);
  }, []);

  return { findOpen, query, results, selected, open, close, setQuery, setSelected };
}
