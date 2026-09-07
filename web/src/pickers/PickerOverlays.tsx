import React from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';
import { HistoryPicker } from './HistoryPicker';
import { ThemePicker } from './ThemePicker';
import { RouteChooser } from './RouteChooser';
import { TabNavPicker } from './TabNavPicker';
import { QueuePicker } from './QueuePicker';
import { TaskPicker } from './TaskPicker';
import type { VisibleTaskRow } from './task-picker-keys';
import { ProfilePicker } from './ProfilePicker';
import type { VisibleProfileRow } from './profile-picker-keys';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { APP_THEMES } from '@shared/app-themes';
import { AppThemePicker } from './AppThemePicker';
import { QuickOpen } from './QuickOpen';
import { firstOpenOverlay } from './overlay-registry';
import type { FuzzyMatchResult } from '../fuzzy-match';

// The mutually-exclusive stack of modal overlays that can float above the command bar. Which one
// wins is not decided here: `firstOpenOverlay` answers that from the one ordered registry the
// keyboard priority chain and the command-bar suppression flag also read (see `overlay-registry`).
// Split out of App.tsx to keep it under the file-size limit.
type Properties = {
  route: RouteChooserView | null;
  routeIndex: number;
  onPickRoute: (index: number) => void;
  syntaxTheme: string;
  themePickerOpen: boolean;
  themePickerIndex: number;
  onPickTheme: (name: string) => void;
  theme: string;
  appThemePickerOpen: boolean;
  appThemePickerIndex: number;
  onPickAppTheme: (name: string) => void;
  pickerOpen: boolean;
  recent: string[];
  pickerIndex: number;
  onPickHistory: (command: string) => void;
  navOpen: boolean;
  navQuery: string;
  navIndex: number;
  tabs: TabView[];
  onPickTab: (index: number) => void;
  queueOpen: boolean;
  queueItems: string[];
  queueIndex: number;
  onSelectQueue: (index: number) => void;
  taskPickerOpen: boolean;
  taskRows: VisibleTaskRow[];
  taskPickerIndex: number;
  onPickTask: (path: string) => void;
  onToggleTaskDir: (path: string) => void;
  profilePickerOpen: boolean;
  profiles: VisibleProfileRow[];
  profilePickerIndex: number;
  onPickProfile: (name: string) => void;
  quickOpenOpen: boolean;
  quickOpenQuery: string;
  onChangeQuickOpenQuery: (query: string) => void;
  quickOpenResults: FuzzyMatchResult[];
  quickOpenIndex: number;
  onChangeQuickOpenIndex: (index: number) => void;
  quickOpenLoading: boolean;
  onPickQuickOpen: (relPath: string) => void;
  onCloseQuickOpen: () => void;
  commandInputRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function PickerOverlays({
  route, routeIndex, onPickRoute, syntaxTheme, themePickerOpen, themePickerIndex, onPickTheme,
  theme, appThemePickerOpen, appThemePickerIndex, onPickAppTheme,
  pickerOpen, recent, pickerIndex, onPickHistory, navOpen, navQuery, navIndex, tabs, onPickTab,
  queueOpen, queueItems, queueIndex, onSelectQueue,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  profilePickerOpen, profiles, profilePickerIndex, onPickProfile,
  quickOpenOpen, quickOpenQuery, onChangeQuickOpenQuery, quickOpenResults, quickOpenIndex, onChangeQuickOpenIndex,
  quickOpenLoading, onPickQuickOpen, onCloseQuickOpen, commandInputRef,
}: Properties) {
  switch (firstOpenOverlay({
    route: route !== null,
    syntaxTheme: themePickerOpen,
    appTheme: appThemePickerOpen,
    quickOpen: quickOpenOpen,
    tabNav: navOpen,
    history: pickerOpen,
    queue: queueOpen,
    task: taskPickerOpen,
    profile: profilePickerOpen,
  })) {
  // `route` is what put this case in play, so it is non-null here; the compiler cannot see that
  // across the registry lookup.
  case 'route': {
    return <RouteChooser cmd={route!.cmd} choices={route!.choices} selected={routeIndex} onPick={onPickRoute} />;
  }
  case 'syntaxTheme': {
    return <ThemePicker themes={SYNTAX_THEMES} active={syntaxTheme} selected={themePickerIndex} onPick={onPickTheme} />;
  }
  case 'appTheme': {
    return <AppThemePicker themes={APP_THEMES} active={theme} selected={appThemePickerIndex} onPick={onPickAppTheme} />;
  }
  case 'quickOpen': {
    return (
      <QuickOpen
        query={quickOpenQuery} onChangeQuery={onChangeQuickOpenQuery} results={quickOpenResults}
        selected={quickOpenIndex} onChangeSelected={onChangeQuickOpenIndex} loading={quickOpenLoading}
        onPick={onPickQuickOpen} onClose={onCloseQuickOpen} commandInputRef={commandInputRef}
      />
    );
  }
  case 'tabNav': { return <TabNavPicker tabs={tabs} query={navQuery} selected={navIndex} onPick={onPickTab} />; }
  case 'history': { return <HistoryPicker items={recent} selected={pickerIndex} onPick={onPickHistory} />; }
  case 'queue': { return <QueuePicker items={queueItems} selected={queueIndex} onSelect={onSelectQueue} />; }
  case 'task': {
    return <TaskPicker rows={taskRows} selected={taskPickerIndex} onPick={onPickTask} onToggleDir={onToggleTaskDir} />;
  }
  case 'profile': {
    return <ProfilePicker profiles={profiles} selected={profilePickerIndex} onPick={onPickProfile} />;
  }
  default: { return null; }
  }
}
