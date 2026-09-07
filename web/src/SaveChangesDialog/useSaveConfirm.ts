import { useCallback, useEffect, useRef, useState } from 'react';

// Which tab the dialog is asking about, held as its label rather than its position. The tab list is
// server-driven and replaced whole on every change, so a position captured when the dialog opened
// can name a different tab by the time a button is pressed — a label cannot.
export function useSaveConfirm() {
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const labelRef = useRef('');
  const generationRef = useRef(0);
  const pendingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { generationRef.current++; }, []);

  const openSaveConfirm = useCallback((label: string) => {
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    labelRef.current = label;
    setSaveConfirmOpen(true);
  }, []);

  const closeSaveConfirm = useCallback(() => {
    generationRef.current++;
    pendingRef.current = false;
    setSaving(false);
    setSaveConfirmOpen(false);
  }, []);

  const startSave = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setSaving(true);
    return { label: labelRef.current, generation: generationRef.current };
  }, []);

  const isCurrentAttempt = useCallback((attempt: { generation: number }) =>
    attempt.generation === generationRef.current, []);

  return { saveConfirmOpen, openSaveConfirm, closeSaveConfirm, labelRef, saving, startSave, isCurrentAttempt };
}
