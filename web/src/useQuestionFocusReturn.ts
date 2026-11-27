import { useEffect, useRef } from 'react';
import type React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './shared/tab/handles';
import { focusCenterVisibleTab } from './useFocusOnTabSwitch';

// A question panel unmounts with the answer. When it held focus that leaves focus on the body, so put
// it back on the harness terminal it came from. Focus held anywhere else is left where it is.
export function useQuestionFocusReturn(
  currentRef: React.RefObject<TabView | undefined>,
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>,
  inputReference: React.RefObject<HTMLTextAreaElement | null>,
): void {
  const questionTab = useRef<string | undefined>(undefined);

  useEffect(() => {
    const current = currentRef.current;
    const pending = current?.pendingQuestion;
    const previous = questionTab.current;
    questionTab.current = pending?.tab;
    if (!previous || pending || current?.label !== previous) return;
    if (current.view !== 'harness' || document.activeElement !== document.body) return;
    focusCenterVisibleTab(current, harnessHandles, inputReference);
  });
}
