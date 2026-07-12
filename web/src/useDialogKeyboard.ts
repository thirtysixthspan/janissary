import { useEffect, useRef } from 'react';

// Global keyboard + click-outside wiring shared by the app's modal dialogs: focuses the dialog on
// mount, registers capture-phase keydown/click listeners, and tears them down on unmount. Clicks
// outside the dialog are swallowed so the modal keeps focus. Each dialog supplies its own key
// handler; it is held in a ref so the mount-once effect always calls the latest one.
export function useDialogKeyboard(
  dialogRef: React.RefObject<HTMLDivElement | null>,
  onKeyDown: (e: KeyboardEvent) => void,
): void {
  const onKeyDownRef = useRef(onKeyDown);
  onKeyDownRef.current = onKeyDown;

  useEffect(() => {
    dialogRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => onKeyDownRef.current(e);
    const onClickOutside = (e: MouseEvent) => {
      if (dialogRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    globalThis.addEventListener('keydown', handleKeyDown, { capture: true });
    globalThis.addEventListener('click', onClickOutside, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, { capture: true });
      globalThis.removeEventListener('click', onClickOutside, { capture: true });
    };
  }, [dialogRef]);
}
