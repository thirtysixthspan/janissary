import { useRef } from 'react';
import type React from 'react';

// A roving-focus keyboard handler for a row of "answer" buttons (a question dialog's options,
// Submit, or Cancel): Tab/ArrowRight moves to the next button, Shift+Tab/ArrowLeft to the
// previous, wrapping around both ends instead of leaving the row. Local to whichever element the
// handler is attached to (never a global listener), so it never traps input elsewhere in the app.
export function useAnswerButtons(count: number, initialIndex: number) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indexRef = useRef(initialIndex);

  const getRef = (i: number) => (el: HTMLButtonElement | null) => { buttonRefs.current[i] = el; };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey);
    const backward = e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
    if (!forward && !backward) return;
    e.preventDefault();
    const next = (indexRef.current + (forward ? 1 : -1) + count) % count;
    indexRef.current = next;
    buttonRefs.current[next]?.focus();
  };

  // For a field that precedes the row (a question dialog's text answer): Shift+Tab wraps backward to
  // the row's last button rather than leaving the dialog. Every other key stays with the field.
  const onFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !e.shiftKey) return;
    e.preventDefault();
    indexRef.current = count - 1;
    buttonRefs.current[count - 1]?.focus();
  };

  return { getRef, onKeyDown, onFieldKeyDown };
}
