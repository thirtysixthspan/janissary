import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { isProgrammaticScroll, isWithinBottomFollowThreshold } from '../api';

export function useConnectionHistoryScroll(
  elementRef: RefObject<HTMLDivElement | null>, active: boolean, offset: number | undefined,
  hasOlder: boolean, loadOlder: () => Promise<unknown>, contentKey: unknown,
) {
  const follow = useRef(true);
  const lastTop = useRef(0);
  const requestedOffset = useRef<number | null>(null);
  const restoreHeight = useRef<{ height: number; contentKey: unknown } | null>(null);

  const requestOlder = useCallback(() => {
    const element = elementRef.current;
    if (!element || !hasOlder || offset === undefined || requestedOffset.current === offset) return;
    requestedOffset.current = offset;
    restoreHeight.current = { height: element.scrollHeight, contentKey };
    void loadOlder().catch(() => {
      requestedOffset.current = null;
      restoreHeight.current = null;
    });
  }, [contentKey, elementRef, hasOlder, loadOlder, offset]);

  const onScroll = useCallback((element: HTMLDivElement) => {
    if (element.scrollTop === 0) requestOlder();
    if (isProgrammaticScroll(element.scrollTop, lastTop.current)) return;
    lastTop.current = element.scrollTop;
    follow.current = isWithinBottomFollowThreshold(element.scrollHeight, element.scrollTop, element.clientHeight);
  }, [requestOlder]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (restoreHeight.current !== null && !Object.is(restoreHeight.current.contentKey, contentKey)) {
      element.scrollTop += element.scrollHeight - restoreHeight.current.height;
      lastTop.current = element.scrollTop;
      restoreHeight.current = null;
      return;
    }
    if (restoreHeight.current !== null) return;
    if (active && follow.current) {
      element.scrollTop = element.scrollHeight;
      lastTop.current = element.scrollTop;
    }
    if (offset !== undefined && requestedOffset.current !== offset) requestedOffset.current = null;
  }, [active, contentKey, elementRef, offset]);

  return { onScroll };
}
