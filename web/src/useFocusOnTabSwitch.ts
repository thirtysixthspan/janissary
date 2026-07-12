import { useEffect } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';

// Focuses the harness/shell PTY tab's terminal, or the command line for everything else — the
// center section's "visible tab" target, shared by tab-switch and by section navigation
// (`useSectionNav`) landing focus back on center.
export function focusCenterVisibleTab(
  currentTab: TabView | undefined,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
): void {
  const harnessPtyId = currentTab?.view === 'harness' ? currentTab.harness?.ptyId : undefined;
  if (harnessPtyId) harnessHandles.current.get(harnessPtyId)?.focus();
  else if (currentTab?.activePty) shellHandles.current.get(currentTab.activePty)?.focus();
  else inputReference.current?.focus();
}

// Switching tabs: harness/shell PTY tabs focus the terminal; all others focus the command line.
export function useFocusOnTabSwitch(
  activeTab: number,
  currentRef: React.RefObject<TabView | undefined>,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    focusCenterVisibleTab(currentRef.current, harnessHandles, shellHandles, inputReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
}
