import { useEffect, useRef } from 'react';

// The tab's own refresh loop: an interval that recomputes the diff while the tab is mounted, the
// header button calling the same recompute directly. The tab is in-memory only, so unmounting it
// stops the loop with it. `send` is held in a ref so it can change without restarting the interval.
export function useDiffRefresh(send: () => Promise<unknown>, intervalMs = 1000): { refresh(): void } {
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const timer = setInterval(() => { void sendRef.current(); }, intervalMs);
    return () => { clearInterval(timer); };
  }, [intervalMs]);
  return {
    refresh: () => { void sendRef.current(); },
  };
}
