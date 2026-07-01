import { useCallback, useRef } from 'react';

// Transcript scrolling: PageUp/Down half-screen, Shift/Ctrl+Up/Down one line (with acceleration
// that doubles every second while held), Ctrl+P/N one line, Escape jumps back to the bottom.
// `handleScrollKey` reports whether it consumed the key so the caller can bail out early;
// `handleScrollKeyUp` resets the acceleration timer when an arrow key is released.
export function useTranscriptScroll(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const scrollAccel = useRef<{ start: number; dir: -1 | 1 } | null>(null);

  const handleScrollKey = useCallback((e: KeyboardEvent): boolean => {
    const element = scrollRef.current;
    if (!element) return false;
    if (e.key === 'PageUp') { e.preventDefault(); element.scrollTop -= element.clientHeight / 2; return true; }
    if (e.key === 'PageDown') { e.preventDefault(); element.scrollTop += element.clientHeight / 2; return true; }
    if ((e.shiftKey || e.ctrlKey) && e.key === 'ArrowUp') {
      e.preventDefault();
      if (!scrollAccel.current || scrollAccel.current.dir !== -1) scrollAccel.current = { start: Date.now(), dir: -1 };
      const elapsed = Date.now() - scrollAccel.current.start;
      const step = Math.min(220, Math.max(22, Math.round(22 * Math.pow(2, elapsed / 1000))));
      element.scrollTop -= step;
      return true;
    }
    if ((e.shiftKey || e.ctrlKey) && e.key === 'ArrowDown') {
      e.preventDefault();
      if (!scrollAccel.current || scrollAccel.current.dir !== 1) scrollAccel.current = { start: Date.now(), dir: 1 };
      const elapsed = Date.now() - scrollAccel.current.start;
      const step = Math.min(220, Math.max(22, Math.round(22 * Math.pow(2, elapsed / 1000))));
      element.scrollTop += step;
      return true;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); element.scrollTop -= 22; return true; }
    if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); element.scrollTop += 22; return true; }
    if (e.key === 'Escape') { e.preventDefault(); element.scrollTop = element.scrollHeight; return true; }
    return false;
  }, [scrollRef]);

  const handleScrollKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') scrollAccel.current = null;
  }, []);

  return { handleScrollKey, handleScrollKeyUp };
}
