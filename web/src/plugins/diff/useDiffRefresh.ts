import { useEffect, useRef } from 'react';

// The tab's own refresh loop: an interval that recomputes the diff while the tab is mounted, the
// header button calling the same recompute directly, and a recompute the moment `key` changes — the
// whitespace flag, which decides which lines git reports. The tab is in-memory only, so unmounting it
// stops the loop with it. `send` is held in a ref so changing the key does not restart the interval.
export function useDiffRefresh(send: () => Promise<unknown>, key: unknown, intervalMs = 1000): { refresh(): void } {
  const sendRef = useRef(send);
  sendRef.current = send;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void sendRef.current();
  }, [key]);
  useEffect(() => {
    const timer = setInterval(() => { void sendRef.current(); }, intervalMs);
    return () => { clearInterval(timer); };
  }, [intervalMs]);
  return {
    refresh: () => { void sendRef.current(); },
  };
}
