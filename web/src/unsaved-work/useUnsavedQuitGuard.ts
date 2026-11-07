import { useCallback, useEffect } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from '../shared/tab/handles';
import { anyDirtyTab } from './dirtyTabs';

// Every whole-app quit trigger reaches `guardedOpenQuitConfirm`. With any dirty tab it starts the
// save walk through `quitWalkRef`, falling back to the plain quit dialog when the walk does not
// start; with none it behaves exactly like the raw `openQuitConfirm` it wraps. Also arms a native
// `beforeunload` prompt for the one close path no in-app dialog can intercept: the actual browser
// tab/window being closed, reloaded, or navigated away from. Browsers render their own generic
// message, not `returnValue`'s text, but setting it is still required to trigger the prompt at all.
export function useUnsavedQuitGuard(
  tabs: TabView[],
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>,
  openQuitConfirm: () => void,
  quitWalkRef: React.RefObject<(() => boolean) | null>,
) {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!anyDirtyTab(tabs, tabHandles)) return;
      e.preventDefault();
      e.returnValue = '';
    };
    globalThis.addEventListener('beforeunload', onBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', onBeforeUnload);
  }, [tabs, tabHandles]);

  const guardedOpenQuitConfirm = useCallback(() => {
    if (anyDirtyTab(tabs, tabHandles) && quitWalkRef.current?.()) return;
    openQuitConfirm();
  }, [tabs, tabHandles, openQuitConfirm, quitWalkRef]);

  return { guardedOpenQuitConfirm };
}
