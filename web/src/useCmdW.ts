import type React from 'react';
import { useEffect } from 'react';

export function useCmdW(
  closeTab: (index: number) => void,
  activeTabRef: React.RefObject<number>,
  quitConfirmOpenRef: React.RefObject<boolean>,
  pickerOpenRef: React.RefObject<boolean>,
  routeRef: React.RefObject<unknown>,
) {
  useEffect(() => {
    const onCloseTab = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w')) return;
      if (pickerOpenRef.current || routeRef.current || quitConfirmOpenRef.current) return;
      e.preventDefault();
      closeTab(activeTabRef.current ?? 0);
    };
    globalThis.addEventListener('keydown', onCloseTab, { capture: true });
    return () => globalThis.removeEventListener('keydown', onCloseTab, { capture: true });
  }, [closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef]);
}
