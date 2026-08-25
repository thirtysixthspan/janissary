import { useEffect } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle, ShellTabHandle, QuestionPanelHandle } from './tab-handles';

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

// Switching tabs: a tab with a pending question focuses its dialog's Cancel button; harness/shell
// PTY tabs focus the terminal; everything else focuses the command line.
export function useFocusOnTabSwitch(
  activeTab: number,
  currentRef: React.RefObject<TabView | undefined>,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  shellHandles: React.RefObject<Map<string, ShellTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
  questionPanelRef: React.RefObject<QuestionPanelHandle | null>,
) {
  useEffect(() => {
    if (currentRef.current?.pendingQuestion) { questionPanelRef.current?.focusCancel(); return; }
    focusCenterVisibleTab(currentRef.current, harnessHandles, shellHandles, inputReference);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs and focus helper are stable; activeTab is the trigger
  }, [activeTab]);
}
