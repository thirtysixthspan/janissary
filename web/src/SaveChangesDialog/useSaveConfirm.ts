import { useCallback, useRef, useState } from 'react';

// Which tab the dialog is asking about, held as its label rather than its position. The tab list is
// server-driven and replaced whole on every change, so a position captured when the dialog opened
// can name a different tab by the time a button is pressed — a label cannot.
export function useSaveConfirm() {
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const labelRef = useRef('');

  const openSaveConfirm = useCallback((label: string) => {
    labelRef.current = label;
    setSaveConfirmOpen(true);
  }, []);

  const closeSaveConfirm = useCallback(() => {
    setSaveConfirmOpen(false);
  }, []);

  return { saveConfirmOpen, openSaveConfirm, closeSaveConfirm, labelRef };
}
