import { useEffect, useState } from 'react';

// One minute, the coarsest unit a row's age is expressed in. A finer tick would repaint rows that
// cannot look different, because a row's age is minute-rounded by the host.
export const CLOCK_TICK_MS = 60_000;

// A minute clock for the rows whose age is drawn from it. It runs only while it is wanted — the
// interval is cleared the moment the launcher stops being visible, and again when it unmounts — so a
// rail nobody is looking at costs nothing. Re-seeded when the launcher becomes visible again, because
// the age a row shows is as of its return, not as of whenever it was last on screen.
export function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => { setNow(Date.now()); }, CLOCK_TICK_MS);
    return () => { clearInterval(timer); };
  }, [active]);
  return now;
}
