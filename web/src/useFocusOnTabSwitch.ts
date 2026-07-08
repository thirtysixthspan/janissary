import { useEffect } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';

// Switching tabs: harness/shell PTY tabs focus the terminal; all others focus the command line.
export function useFocusOnTabSwitch(
  activeTab: number,
  currentRef: React.RefObject<TabView | undefined>,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    const cur = currentRef.current;
    const harnessPtyId = cur?.view === 'harness' ? cur.harness?.ptyId : undefined;
    if (harnessPtyId) harnessHandles.current.get(harnessPtyId)?.focus();
    else if (cur?.activePty) shellHandles.current.get(cur.activePty)?.focus();
    else inputReference.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
}
