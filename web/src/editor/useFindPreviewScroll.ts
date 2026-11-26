// Scrolls the editor body as the find overlay previews a result: the match goes one quarter down the
// body, and the run-out below the last line (see find-runout.ts) makes room for that when the match
// is near the end of the file. The returned scroll handler gives the room back as the body scrolls
// up again, whether or not the overlay is still open.

import { useEffect, useRef } from 'react';
import type { LineFindApi } from '../shared/line-find/useLineFind';
import { positionCaretAtQuarter } from './scroll';
import { trimRunout } from './find-runout';

export function useFindPreviewScroll(
  bodyRef: React.RefObject<HTMLElement | null>,
  caretRef: React.RefObject<HTMLElement | null>,
  find: Pick<LineFindApi, 'findOpen' | 'results' | 'selected'>,
  cursorLine: number | undefined,
): { runoutRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void } {
  const runoutRef = useRef<HTMLDivElement>(null);
  const { findOpen, results, selected } = find;

  useEffect(() => {
    const result = results[selected];
    if (!findOpen || !result || cursorLine !== result.index) return;
    if (!bodyRef.current || !caretRef.current || !runoutRef.current) return;
    positionCaretAtQuarter(bodyRef.current, caretRef.current, runoutRef.current);
  }, [findOpen, results, selected, cursorLine, bodyRef, caretRef]);

  const onScroll = () => {
    if (bodyRef.current && runoutRef.current) trimRunout(bodyRef.current, runoutRef.current);
  };

  return { runoutRef, onScroll };
}
