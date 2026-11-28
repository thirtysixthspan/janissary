import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './shared/tab/handles';
import { focusCenterVisibleTab } from './useFocusOnTabSwitch';

export function useQuestionFocusReturn(
  currentRef: React.RefObject<TabView | undefined>,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
): (hadFocus: boolean) => void {
  const questionTab = useRef<string | undefined>(undefined);
  const removedPanelHadFocus = useRef(false);
  const recordPanelRemoval = useCallback((hadFocus: boolean) => { removedPanelHadFocus.current = hadFocus; }, []);

  useEffect(() => {
    const current = currentRef.current;
    const pending = current?.pendingQuestion;
    const previous = questionTab.current;
    const hadFocus = removedPanelHadFocus.current;
    questionTab.current = pending?.tab;
    removedPanelHadFocus.current = false;
    if (!hadFocus || !previous || pending || current?.label !== previous) return;
    if (current.view !== 'harness' || document.activeElement !== document.body) return;
    focusCenterVisibleTab(current, harnessHandles, inputReference);
  });

  return recordPanelRemoval;
}
