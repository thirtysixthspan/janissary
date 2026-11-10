import { useCallback, useEffect, useRef, useState } from 'react';

// A value that shows for a fixed time and then clears itself — a "Saved" flash or a saved-file
// name. Each `show` replaces the pending timer, so a second confirmation gets its full duration,
// and unmounting cancels the timer so nothing fires into a gone component.
export function useTransientValue<T>(durationMs: number): readonly [T | null, (value: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const show = useCallback((next: T) => {
    cancel();
    setValue(next);
    timer.current = setTimeout(() => { setValue(null); }, durationMs);
  }, [cancel, durationMs]);

  const clear = useCallback(() => {
    cancel();
    setValue(null);
  }, [cancel]);

  return [value, show, clear] as const;
}
