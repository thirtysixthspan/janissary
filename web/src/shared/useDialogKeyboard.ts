import { useEffect, useRef } from 'react';

// A key→handler map, keyed by lowercased `KeyboardEvent.key` ('y', 'enter', 'arrowleft', …).
export type DialogKeyMap = Record<string, () => void>;

// Swallows the event outright — every key, not just the mapped ones — then dispatches by lowercased
// key. A dialog using the map form traps the keyboard for as long as it is open.
function dispatchByKey(keys: DialogKeyMap): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    keys[e.key.toLowerCase()]?.();
  };
}

// Global keyboard + click-outside wiring shared by the app's modal dialogs: focuses the dialog on
// mount, registers capture-phase keydown/click listeners, and tears them down on unmount. Clicks
// outside the dialog are swallowed so the modal keeps focus.
//
// Each dialog supplies either a raw keydown handler (it decides what to swallow) or a key→handler
// map (every key is swallowed, mapped ones dispatch). Either way it is held in a ref refreshed on
// every render, so the mount-once listener always runs the latest one — a map rebuilt inline from
// current props and state needs no separate latest-value refs.
export function useDialogKeyboard(
  dialogRef: React.RefObject<HTMLDivElement | null>,
  onKeyDown: ((e: KeyboardEvent) => void) | DialogKeyMap,
): void {
  const onKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => { /* replaced below on every render */ });
  onKeyDownRef.current = typeof onKeyDown === 'function' ? onKeyDown : dispatchByKey(onKeyDown);

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
