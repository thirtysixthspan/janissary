import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { spliceIntoTextarea, type AppCommandBar } from '../api';

// The two ways the application writes into this shell's bar. While the queue popup is open over this
// tab, the selected queued line is mirrored into the bar for editing, and closing the popup clears it.
// A task picked for this tab is spliced in at the caret. Both arrive through a command bar already
// bound to this tab, so a popup open over any other tab never reaches this bar's draft or focus.
export function useApplicationBarEdits(
  appBar: AppCommandBar,
  inputReference: RefObject<HTMLTextAreaElement | null>,
  draft: string,
  setDraft: Dispatch<SetStateAction<string>>,
): void {
  const queueWasOpen = useRef(false);
  const draftReference = useRef(draft);
  draftReference.current = draft;
  const { queueOpen, queueIndex, queueItems, registerCommandLineInsertion } = appBar;

  useEffect(() => {
    if (queueOpen) {
      setDraft(queueItems[queueIndex] ?? '');
      inputReference.current?.focus();
    } else if (queueWasOpen.current) {
      setDraft('');
    }
    queueWasOpen.current = queueOpen;
  }, [inputReference, queueIndex, queueItems, queueOpen, setDraft]);

  useEffect(() => registerCommandLineInsertion((text) => {
    const element = inputReference.current;
    if (!element) return;
    element.focus();
    spliceIntoTextarea(element, draftReference.current, text);
  }), [inputReference, registerCommandLineInsertion]);
}
