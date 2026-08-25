import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { EditorTabHandle } from './EditorTab';
import { anyDirtyTab } from './dirtyTabs';

// `quit` and closing the last tab both go straight to the quit dialog, bypassing CloseSaveGuard's
// per-tab check entirely (neither goes through `closeTab`) — this is the one place that catches
// unsaved editor tabs on that path. When none are dirty, behaves exactly like the raw
// `openQuitConfirm` it wraps. Also arms a native `beforeunload` prompt for the one close path no
// in-app dialog can intercept: the actual browser tab/window being closed, reloaded, or navigated
// away from. Browsers render their own generic message, not `returnValue`'s text, but setting it
// is still required to trigger the prompt at all.
export function useUnsavedQuitGuard(
  tabs: TabView[],
  tabHandles: React.RefObject<Map<string, EditorTabHandle>>,
  openQuitConfirm: () => void,
  runCommand: (text: string) => void,
) {
  const [unsavedQuitOpen, setUnsavedQuitOpen] = useState(false);

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
    if (anyDirtyTab(tabs, tabHandles)) setUnsavedQuitOpen(true);
    else openQuitConfirm();
  }, [tabs, tabHandles, openQuitConfirm]);

  const confirmUnsavedQuit = useCallback(() => { setUnsavedQuitOpen(false); runCommand('quit'); }, [runCommand]);
  const cancelUnsavedQuit = useCallback(() => setUnsavedQuitOpen(false), []);

  return { unsavedQuitOpen, guardedOpenQuitConfirm, confirmUnsavedQuit, cancelUnsavedQuit };
}
