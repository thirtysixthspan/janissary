import { useCallback, useState, type RefObject } from 'react';

// Owns the `quit` confirmation dialog's open/close state and its confirm/cancel handlers.
// `openQuitConfirm` is called when `quit` is submitted at the command line; confirming actually
// runs `quit`, cancelling just closes the dialog and refocuses the command line.
export function useQuitConfirm(runCommand: (text: string) => void, inputRef: RefObject<HTMLTextAreaElement | null>) {
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);

  const openQuitConfirm = useCallback(() => setQuitConfirmOpen(true), []);
  const confirmQuit = useCallback(() => { setQuitConfirmOpen(false); runCommand('quit'); }, [runCommand]);
  const cancelQuit = useCallback(() => {
    setQuitConfirmOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [inputRef]);

  return { quitConfirmOpen, openQuitConfirm, confirmQuit, cancelQuit };
}
