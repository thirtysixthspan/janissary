import { useRef } from 'react';

// Keeps a ref pointed at the latest value across renders — useful for a callback prop or piece
// of state that a stable handler (like a keydown listener set up once) needs to read fresh.
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
