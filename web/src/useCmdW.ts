import type React from 'react';
import { useEffect } from 'react';

export function useCmdW(
  closeTab: (index: number) => void,
  activeTabRef: React.RefObject<number>,
  quitConfirmOpenRef: React.RefObject<boolean>,
  pickerOpenRef: React.RefObject<boolean>,
  routeRef: React.RefObject<unknown>,
  activeViewRef?: React.RefObject<string | undefined>,
) {
  useEffect(() => {
    const onCloseTab = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w')) return;
      if (pickerOpenRef.current || routeRef.current || quitConfirmOpenRef.current) return;
      e.preventDefault();
      closeTab(activeTabRef.current ?? 0);
    };
    globalThis.addEventListener('keydown', onCloseTab, { capture: true });

    // Fallback for PageTab (cross-origin iframe): keyboard events inside a
    // cross-origin iframe never reach the parent window's capture-phase listener,
    // so Cmd+W would close the browser window instead of the app tab. Intercept
    // the browser-level close via beforeunload and close the app tab instead.
    let reEntryGuard = false;
    const onBeforeUnload = (e: Event) => {
      if (reEntryGuard) return;
      if (activeViewRef?.current !== 'page') return;
      if (pickerOpenRef.current || routeRef.current || quitConfirmOpenRef.current) return;
      reEntryGuard = true;
      e.preventDefault();
      closeTab(activeTabRef.current ?? 0);
    };
    globalThis.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      globalThis.removeEventListener('keydown', onCloseTab, { capture: true });
      globalThis.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef]);
}
