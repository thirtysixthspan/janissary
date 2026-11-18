import { useCallback, useEffect, useState } from 'react';
import type { JanusClient } from './shared/ws/ws';
import type { TabView, HarnessLaunchView, ScheduleLaunchView, TaskRow, ProfileRow, DisabledApplicationCommand } from '@shared/protocol';
import { DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH, DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES, DEFAULT_TAB_NAME_MAX_LENGTH } from '@shared/shared/config-defaults';
import { useProjectTitle } from './useProjectTitle';

export type AppSettings = {
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  clipboardHistoryMaxEntries: number;
};

type Setters = {
  setTabs: (tabs: TabView[]) => void;
  setActiveTab: (index: number) => void;
  setSecondaryTab: (index: number | undefined) => void;
  setHarnessLaunch: (view: HarnessLaunchView | null) => void;
  setScheduleLaunch: (view: ScheduleLaunchView | null) => void;
  setSettings: (partial: Partial<AppSettings>) => void;
  setGlobalHistory: (history: string[]) => void;
  setSyntaxTheme: (theme: string) => void;
  setTheme: (theme: string) => void;
  setTasks: (tasks: TaskRow[]) => void;
  setProfiles: (profiles: ProfileRow[]) => void;
  setDisabledApplicationCommands: (commands: DisabledApplicationCommand[]) => void;
};

// The three display limits are server-owned tunables. The browser seeds them from the same
// constants the server defaults to, then the state snapshot overwrites them.
export function useAppSettings(): { settings: AppSettings; setSettings: (partial: Partial<AppSettings>) => void } {
  const [settings, updateSettings] = useState<AppSettings>({
    tabNameMaxLength: DEFAULT_TAB_NAME_MAX_LENGTH,
    activeTabNameMaxLength: DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH,
    clipboardHistoryMaxEntries: DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES,
  });
  const setSettings = useCallback((partial: Partial<AppSettings>) => {
    updateSettings((previous) => ({ ...previous, ...partial }));
  }, []);
  return { settings, setSettings };
}

// Subscribes App to server state snapshots, fanning each field out to its setter. Split out of
// App.tsx to keep it under the file-size limit. Also mirrors `projectDir` into the titlebar, since
// that field has no other consumer in `App.tsx`.
export function useServerState(client: JanusClient, setters: Setters): void {
  const {
    setTabs, setActiveTab, setSecondaryTab, setHarnessLaunch, setScheduleLaunch,
    setSettings,
    setGlobalHistory, setSyntaxTheme, setTheme,
    setTasks, setProfiles, setDisabledApplicationCommands,
  } = setters;
  const [projectDir, setProjectDir] = useState('');
  const [version, setVersion] = useState('');
  useProjectTitle(projectDir, version);
  useEffect(() => client.onState(({
    tabs: nextTabs, activeTab: active, secondaryTab: secondary,
    tabNameMaxLength: nextTabNameMaxLength, activeTabNameMaxLength: nextActiveTabNameMaxLength,
    clipboardHistoryMaxEntries: nextClipboardHistoryMaxEntries,
    globalHistory: nextGlobalHistory, syntaxTheme: nextSyntaxTheme, theme: nextTheme,
    tasks: nextTasks, profiles: nextProfiles,
    disabledApplicationCommands: nextDisabledApplicationCommands,
    projectDir: nextProjectDir, version: nextVersion,
    harnessLaunch: nextHarnessLaunch, scheduleLaunch: nextScheduleLaunch,
  }) => {
    setTabs(nextTabs);
    setActiveTab(active);
    setSecondaryTab(secondary);
    setHarnessLaunch(nextHarnessLaunch);
    setScheduleLaunch(nextScheduleLaunch);
    setSettings({
      tabNameMaxLength: nextTabNameMaxLength,
      activeTabNameMaxLength: nextActiveTabNameMaxLength,
      clipboardHistoryMaxEntries: nextClipboardHistoryMaxEntries,
    });
    setGlobalHistory(nextGlobalHistory);
    setSyntaxTheme(nextSyntaxTheme);
    setTheme(nextTheme);
    setTasks(nextTasks);
    setProfiles(nextProfiles);
    setDisabledApplicationCommands(nextDisabledApplicationCommands);
    setProjectDir(nextProjectDir);
    setVersion(nextVersion);
  }), [
    client, setTabs, setActiveTab, setSecondaryTab, setHarnessLaunch, setScheduleLaunch,
    setSettings,
    setGlobalHistory, setSyntaxTheme, setTheme,
    setTasks, setProfiles, setDisabledApplicationCommands,
  ]);
}
