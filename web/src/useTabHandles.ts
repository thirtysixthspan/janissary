import { useRef } from 'react';
import type { HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';
import type { QuestionPanelHandle } from './QuestionPanel';

// The imperative handles App.tsx hands down to MountedViewLayers/useFocusOnTabSwitch for
// focusing whichever surface a tab switch (or Ctrl+A/G section nav) should land keyboard focus
// on: the harness/shell terminal, or the question dialog's Cancel button.
export function useTabHandles() {
  const harnessHandles = useRef<Map<string, HarnessTabHandle>>(new Map());
  const shellHandles = useRef<Map<string, ShellTabHandle>>(new Map());
  const questionPanelRef = useRef<QuestionPanelHandle>(null);
  return { harnessHandles, shellHandles, questionPanelRef };
}
