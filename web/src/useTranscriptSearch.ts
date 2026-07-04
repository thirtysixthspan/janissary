import { useEffect, useMemo, useRef, useState } from 'react';
import type { BufferLine } from '@shared/protocol';
import { compilePattern, findMatches } from '@shared/search-matches';

export type SearchStatus = 'empty' | 'invalid' | 'no-match' | 'match';

// Search-mode state for the transcript: open/closed, the pattern, and which match is current.
// `matchIndex` counts backward from the most recent match (0 = most recent), so stepping
// "older" increments it and stepping "newer" decrements it — matching the arrow-key direction
// a user expects when scanning back through history.
export function useTranscriptSearch(lines: BufferLine[], activeLabel: string) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [pattern, setPatternState] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const activeLabelRef = useRef(activeLabel);

  const matches = useMemo(() => findMatches(lines, pattern), [lines, pattern]);

  // Clamp whenever the match list changes shape (new transcript lines arrive, or the pattern
  // changes) so a live tab never leaves the index pointing past the end.
  useEffect(() => {
    setMatchIndex((prev) => Math.min(prev, Math.max(0, matches.length - 1)));
  }, [matches.length]);

  // Switching tabs closes search mode — a search only makes sense against the tab it was opened on.
  useEffect(() => {
    if (activeLabelRef.current === activeLabel) return;
    activeLabelRef.current = activeLabel;
    setSearchOpen(false);
  }, [activeLabel]);

  const invalid = pattern.trim() !== '' && compilePattern(pattern) === null;
  const currentLineIndex = matches.length > 0 ? matches[matches.length - 1 - matchIndex] : null;
  const status: SearchStatus = pattern.trim() === '' ? 'empty' : invalid ? 'invalid' : matches.length === 0 ? 'no-match' : 'match';
  const position = matches.length > 0 ? { current: matches.length - matchIndex, total: matches.length } : null;

  const open = (initialPattern: string) => {
    setPatternState(initialPattern);
    setMatchIndex(0);
    setSearchOpen(true);
  };
  const close = () => setSearchOpen(false);
  const setPattern = (next: string) => { setPatternState(next); setMatchIndex(0); };
  const stepOlder = () => setMatchIndex((prev) => Math.min(prev + 1, Math.max(0, matches.length - 1)));
  const stepNewer = () => setMatchIndex((prev) => Math.max(prev - 1, 0));

  return { searchOpen, pattern, status, position, currentLineIndex, open, close, setPattern, stepOlder, stepNewer };
}
