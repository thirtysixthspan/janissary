import { useCallback, useEffect, useRef } from 'react';
import { useDialogKeyboard } from './useDialogKeyboard';

// Shared dialog keyboard wiring and remembered-submit focus behavior.
export function useLaunchDialog(
  onCancel: () => void,
  onCreate: () => void,
  canSubmit: boolean,
  hadRemembered: boolean,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const cancel = useCallback(() => onCancel(), [onCancel]);
  const create = useCallback(() => onCreate(), [onCreate]);

  useDialogKeyboard(dialogRef, (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (canSubmit) create(); }
  });

  useEffect(() => {
    if (hadRemembered) submitButtonRef.current?.focus();
  }, [hadRemembered]);

  return { dialogRef, submitButtonRef, cancel, create };
}
