import { useEffect, useState } from 'react';

// A value that only updates once it has stopped changing for `delayMs`. The timer is cleared on
// every change and on unmount, so a value that settles after the component is gone never lands.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
