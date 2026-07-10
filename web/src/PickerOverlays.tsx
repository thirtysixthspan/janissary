import React from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';
import { HistoryPicker } from './HistoryPicker';
import { ThemePicker } from './ThemePicker';
import { RouteChooser } from './RouteChooser';
import { TabNavPicker } from './TabNavPicker';
import { QueuePicker } from './QueuePicker';
import { TaskPicker } from './TaskPicker';
import type { VisibleTaskRow } from './task-picker-keys';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { APP_THEMES } from '@shared/app-themes';
import { AppThemePicker } from './AppThemePicker';

// The mutually-exclusive stack of modal overlays that can float above the command bar: route
// chooser takes priority, then the syntax-theme picker, then whichever of `hist`/`nav` is open.
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
};

export function PickerOverlays({
  route, routeIndex, onPickRoute, syntaxTheme, themePickerOpen, themePickerIndex, onPickTheme,
  theme, appThemePickerOpen, appThemePickerIndex, onPickAppTheme,
  pickerOpen, recent, pickerIndex, onPickHistory, navOpen, navQuery, navIndex, tabs, onPickTab,
  queueOpen, queueItems, queueIndex, onSelectQueue,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
}: Properties) {
  if (route) return <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIndex} onPick={onPickRoute} />;
  if (themePickerOpen) {
    return <ThemePicker themes={SYNTAX_THEMES} active={syntaxTheme} selected={themePickerIndex} onPick={onPickTheme} />;
  }
  if (appThemePickerOpen) {
    return <AppThemePicker themes={APP_THEMES} active={theme} selected={appThemePickerIndex} onPick={onPickAppTheme} />;
  }
  if (navOpen) return <TabNavPicker tabs={tabs} query={navQuery} selected={navIndex} onPick={onPickTab} />;
  if (pickerOpen) return <HistoryPicker items={recent} selected={pickerIndex} onPick={onPickHistory} />;
  if (queueOpen) return <QueuePicker items={queueItems} selected={queueIndex} onSelect={onSelectQueue} />;
  if (taskPickerOpen) return <TaskPicker rows={taskRows} selected={taskPickerIndex} onPick={onPickTask} onToggleDir={onToggleTaskDir} />;
  return null;
}
