import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH, DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES, DEFAULT_TAB_NAME_MAX_LENGTH } from '@shared/shared/config-defaults';
import type { AppSettings } from './useServerState';

// The default keeps a component rendered outside the provider honest: it sees the same limits the
// server starts with, rather than a second set of literals.
const DEFAULT_SETTINGS: AppSettings = {
  tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
  activeTabNameMaxLength: DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
  clipboardHistoryMaxEntries: DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES,
};

const AppSettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export function AppSettingsProvider({ settings, children }: { settings: AppSettings; children: ReactNode }) {
  return <AppSettingsContext.Provider value={settings}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettingsContext(): AppSettings {
  return useContext(AppSettingsContext);
}
