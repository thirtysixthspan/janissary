import React from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';
import { HistoryPicker } from './HistoryPicker';
import { ThemePicker } from './ThemePicker';
import { RouteChooser } from './RouteChooser';
import { TabNavPicker } from './TabNavPicker';
import { SYNTAX_THEMES } from '@shared/syntax-themes';

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
  pickerOpen: boolean;
  recent: string[];
  pickerIndex: number;
  onPickHistory: (command: string) => void;
  navOpen: boolean;
  navQuery: string;
  navIndex: number;
  tabs: TabView[];
  onPickTab: (index: number) => void;
};

export function PickerOverlays({
  route, routeIndex, onPickRoute, syntaxTheme, themePickerOpen, themePickerIndex, onPickTheme,
  pickerOpen, recent, pickerIndex, onPickHistory, navOpen, navQuery, navIndex, tabs, onPickTab,
}: Properties) {
  if (route) return <RouteChooser cmd={route.cmd} choices={route.choices} selected={routeIndex} onPick={onPickRoute} />;
  if (themePickerOpen) {
    return <ThemePicker themes={SYNTAX_THEMES} active={syntaxTheme} selected={themePickerIndex} onPick={onPickTheme} />;
  }
  if (navOpen) return <TabNavPicker tabs={tabs} query={navQuery} selected={navIndex} onPick={onPickTab} />;
  if (pickerOpen) return <HistoryPicker items={recent} selected={pickerIndex} onPick={onPickHistory} />;
  return null;
}
