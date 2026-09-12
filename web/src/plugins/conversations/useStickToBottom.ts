import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

// Stick-to-bottom pinning for a scrolling transcript. Owns the `stick` and `lastTop` refs and the
// 1px-versus-40px threshold arithmetic so the rules live in a module instead of a component body;
// the caller supplies the scroll container, whether the view is the visible one, and a value that
// changes whenever the content the pin should follow has changed.

export function useStickToBottom(
  turnsRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  rePinKey: unknown,
): { pin: () => void; onScroll: (element: HTMLDivElement) => void } {
  const stick = useRef(true);
  // The scroll position the pin effect itself last wrote. Scroll events are delivered
  // asynchronously, so the event a pin triggers can land after newer output has grown the
  // content: at that moment the viewport measures far from the bottom although the user never
  // moved it. Comparing against this value tells the two apart.
  const lastTop = useRef(0);

  const pin = useCallback(() => {
    const element = turnsRef.current;
    if (!active || !element || !stick.current) return;
    element.scrollTop = element.scrollHeight;
    lastTop.current = element.scrollTop;
  }, [active, turnsRef]);

  useEffect(() => { pin(); }, [pin, rePinKey]);

  const onScroll = useCallback((element: HTMLDivElement) => {
    if (Math.abs(element.scrollTop - lastTop.current) < 1) return;
    lastTop.current = element.scrollTop;
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }, []);

  return { pin, onScroll };
}
