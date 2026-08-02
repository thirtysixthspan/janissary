// State for the editor tab's Cmd+F find overlay: the open flag, the query, the capped ranked
// results, and the highlighted row. Mirrors `useQuickOpen`'s surface minus everything about
// loading and fetching — the candidates are the buffer's own lines, already in memory, so a match
// can be on text that has never been written to disk.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fuzzyMatch, type FuzzyMatchResult } from '../fuzzy-match';

const RESULT_CAP = 10;

export type EditorFindApi = {
  findOpen: boolean;
  query: string;
  results: FuzzyMatchResult[];
  selected: number;
  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelected: (index: number) => void;
};

export function useEditorFind(lines: string[] | null, active: boolean): EditorFindApi {
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [selected, setSelected] = useState(0);

  // Not deferred, unlike `useQuickOpen`: one file's lines are orders of magnitude fewer than a
  // project's file list, and the scan bails per candidate on the first unmatched query character.
  const results = useMemo<FuzzyMatchResult[]>(
    () => (findOpen && lines ? fuzzyMatch(lines, query, RESULT_CAP) : []),
    [findOpen, lines, query],
  );

  // Clamp whenever the result list changes shape — a live reload or an edit behind the overlay can
  // shrink it under the highlighted row.
  useEffect(() => {
    setSelected((previous) => Math.min(previous, Math.max(0, results.length - 1)));
  }, [results.length]);

  // Leaving the editor tab closes the overlay; the tab stays mounted across tab switches, so this
  // reacts to `active` going false rather than to an unmount.
  useEffect(() => {
    if (!active) setFindOpen(false);
  }, [active]);

  const open = useCallback(() => {
    setQueryState('');
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
