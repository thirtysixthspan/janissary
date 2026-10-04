import { useEffect, useRef, type RefObject } from 'react';
import { registerCommandBarDrop } from '../drop-registry';
import { spliceIntoTextarea } from './textarea-splice';

// Registers a command bar as a file-navigator drop target while it is mounted and `enabled`: a drop
// is spliced in at the textarea's caret, through the same input event typing raises, and hovering
// toggles the bar's `drop-target` highlight. The draft is read through a ref so the registration
// does not churn on every keystroke.
export function useCommandBarDrop(
  root: RefObject<HTMLElement | null>,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  enabled: boolean,
): void {
  const valueReference = useRef(value);
  valueReference.current = value;
  useEffect(() => {
    const element = root.current;
    if (!enabled || !element) return;
    return registerCommandBarDrop(element, {
      insertAtCaret: (text) => {
        const input = inputRef.current;
        if (!input) return;
        input.focus();
        spliceIntoTextarea(input, valueReference.current, text);
      },
      setDropHighlighted: (active) => { element.classList.toggle('drop-target', active); },
    });
  }, [enabled, inputRef, root]);
}
