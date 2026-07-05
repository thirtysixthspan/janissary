import { useState } from 'react';
import { SYNTAX_THEMES } from '@shared/syntax-themes';

// State and handlers for the `syntax theme` picker modal (mirrors the `hist` picker's shape in
// App, split out to keep App.tsx under the file-size limit).
export function useThemePicker(syntaxTheme: string, runCommand: (text: string) => void) {
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [themePickerIndex, setThemePickerIndex] = useState(0);

  const openThemePicker = () => {
    setThemePickerIndex(Math.max(0, SYNTAX_THEMES.indexOf(syntaxTheme)));
    setThemePickerOpen(true);
  };
  const pickTheme = (name: string) => { runCommand(`syntax theme ${name}`); setThemePickerOpen(false); };

  return { themePickerOpen, themePickerIndex, setThemePickerIndex, setThemePickerOpen, openThemePicker, pickTheme };
}
