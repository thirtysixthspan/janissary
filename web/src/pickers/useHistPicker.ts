import { useState } from 'react';

// State and handlers for the Ctrl+R / `hist` history picker (mirrors the `hist` picker's shape in
// App, split out to keep App.tsx under the file-size limit). Enter (or a row click) runs the
// selected command immediately — unlike the `queue`/`tasks` pickers, which populate the command
// line without submitting.
export function useHistPicker(recent: string[], runCommand: (text: string) => void) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState(0);

  const openPicker = () => {
    // Always open on hist / Ctrl+R; highlight the most recent (bottom) entry.
    setPickerIndex(Math.max(0, recent.length - 1));
    setPickerOpen(true);
  };
  const pick = (command: string) => { runCommand(command); setPickerOpen(false); };

  return { pickerOpen, pickerIndex, setPickerIndex, setPickerOpen, openPicker, pick };
}
