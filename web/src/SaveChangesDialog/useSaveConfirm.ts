import { useCallback, useRef, useState } from 'react';

export function useSaveConfirm() {
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const indexRef = useRef(0);

  const openSaveConfirm = useCallback((index: number) => {
    indexRef.current = index;
    setSaveConfirmOpen(true);
  }, []);

  const closeSaveConfirm = useCallback(() => {
    setSaveConfirmOpen(false);
  }, []);

  return { saveConfirmOpen, openSaveConfirm, closeSaveConfirm, indexRef };
}
