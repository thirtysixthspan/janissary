import React, { useCallback, useEffect, useState } from 'react';
import { handlePickerKey, HistoryPicker } from '../api';

// This tab's own history list, opened by the `Ctrl+R` its declaration claims. It shares the app's
// picker presentation and key handler, but picking a line recalls it into this command bar rather
// than running it.
export function ShellHistoryPopup({ lines, onPick, onClose }: {
  lines: string[];
  onPick: (line: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => Math.max(0, lines.length - 1));
  const pick = useCallback((line: string) => { onPick(line); onClose(); }, [onClose, onPick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      handlePickerKey(event, lines, selected, setSelected, pick, onClose);
    };
    globalThis.addEventListener('keydown', onKey);
    return () => { globalThis.removeEventListener('keydown', onKey); };
  }, [lines, onClose, pick, selected]);

  return <HistoryPicker className="shell-history" items={lines} selected={selected} onPick={pick} emptyMessage="No commands sent yet" />;
}
