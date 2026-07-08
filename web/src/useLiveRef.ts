import { useRef } from 'react';

// A ref that always holds the latest value, for callbacks (e.g. a window keydown listener) that
// must read current state/handlers without re-registering on every render.
export function useLiveRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
