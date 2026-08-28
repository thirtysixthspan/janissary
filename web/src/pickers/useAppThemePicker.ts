import { useEffect, useState } from 'react';
import { APP_THEMES, DEFAULT_APP_THEME } from '@shared/app-themes';

// State and handlers for the application `theme` picker modal, plus the theme value itself:
// `setTheme` receives the server's `StateEvent.theme` and the effect mirrors it onto
// `<html data-theme="...">`, where theme.css's `[data-theme]` palette blocks pick it up.
// Mirrors useThemePicker's shape (split out to keep App.tsx under the file-size limit).
export function useAppThemePicker(runCommand: (text: string) => void) {
  const [theme, setTheme] = useState(DEFAULT_APP_THEME);
  const [appThemePickerOpen, setAppThemePickerOpen] = useState(false);
  const [appThemePickerIndex, setAppThemePickerIndex] = useState(0);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const openAppThemePicker = () => {
    setAppThemePickerIndex(Math.max(0, APP_THEMES.indexOf(theme)));
    setAppThemePickerOpen(true);
  };
  const pickAppTheme = (name: string) => { runCommand(`theme ${name}`); setAppThemePickerOpen(false); };

  return {
    theme, setTheme,
    appThemePickerOpen, appThemePickerIndex, setAppThemePickerIndex, setAppThemePickerOpen,
    openAppThemePicker, pickAppTheme,
  };
}
