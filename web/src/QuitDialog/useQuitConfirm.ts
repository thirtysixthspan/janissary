import { useCallback, useRef, useState, type RefObject } from 'react';

// Owns the `quit` confirmation dialog's open/close state and its confirm/cancel handlers.
// `openQuitConfirm` is called when `quit` is submitted at the command line; confirming actually
// runs `quit`, cancelling just closes the dialog and refocuses the command line.
export function useQuitConfirm(runCommand: (text: string) => void, inputRef: RefObject<HTMLTextAreaElement | null>) {
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const commandInputOnOpen = useRef<HTMLTextAreaElement | null>(null);

  const openQuitConfirm = useCallback(() => {
    const activeElement = document.activeElement;
    commandInputOnOpen.current = activeElement instanceof HTMLTextAreaElement && activeElement.closest('.command')
      ? activeElement
      : null;
    setQuitConfirmOpen(true);
  }, []);
  const confirmQuit = useCallback(() => {
    commandInputOnOpen.current = null;
    setQuitConfirmOpen(false);
    runCommand('quit');
  }, [runCommand]);
  const cancelQuit = useCallback(() => {
    setQuitConfirmOpen(false);
    const commandInput = commandInputOnOpen.current;
    commandInputOnOpen.current = null;
    requestAnimationFrame(() => (commandInput ?? inputRef.current)?.focus());
  }, [inputRef]);

  return { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit };
}
