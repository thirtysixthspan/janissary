import React from 'react';
import { HistoryPicker } from '../shared/command-bar/HistoryPicker';
import { ThemePicker } from './ThemePicker';
import { RouteChooser } from './RouteChooser';
import { TabNavPicker } from './TabNavPicker';
import { QueuePicker } from './QueuePicker';
import { TaskPicker } from './TaskPicker';
import { ProfilePicker } from './ProfilePicker';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { APP_THEMES } from '@shared/app-themes';
import { AppThemePicker } from './AppThemePicker';
import { QuickOpen } from './QuickOpen';
import { firstOpenOverlay } from './overlay-registry';
import { contributedOverlayAnchor, contributedOverlayOnScreen } from '../shared/contributed-overlays';
import type { PickerOverlayView } from './picker/overlay-view';

// The mutually-exclusive stack of modal overlays that can float above the command bar. Which one
// wins is not decided here: `activeOverlay` answers that from the one ordered registry the keyboard
// priority chain and the command-bar suppression flag also read (see `overlay-registry`), which pairs
// the nine built-in overlays with whatever a plugin has contributed through the shared seam. Split
// out of App.tsx to keep it under the file-size limit.
//
// The prop list is `PickerOverlayView`, declared beside the builder that fills it, so the hook that
// owns the state assembles the whole bag once and the app shell passes it as a single prop.
export function PickerOverlays({
  overlays, route, routeIndex, onPickRoute, syntaxTheme, themePickerIndex, onPickTheme,
  theme, appThemePickerIndex, onPickAppTheme,
  recent, pickerIndex, onPickHistory, navQuery, navIndex, tabs, onPickTab,
  queueItems, queueIndex, onSelectQueue,
  taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  profiles, profilePickerIndex, onPickProfile,
  quickOpenQuery, onChangeQuickOpenQuery, quickOpenResults, quickOpenIndex, onChangeQuickOpenIndex,
  quickOpenLoading, onPickQuickOpen, onCloseQuickOpen, restoreQuickOpenFocus,
}: PickerOverlayView) {
  switch (firstOpenOverlay(overlays)) {
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
        onPick={onPickQuickOpen} onClose={onCloseQuickOpen} restoreFocus={restoreQuickOpenFocus}
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
  // No built-in overlay is up, which is the only condition under which a contributed one can be: the
  // registry ranks the nine above every plugin, so a chord pressed while one of them is open never
  // reaches here.
  default: {
    const contributed = contributedOverlayOnScreen();
    if (!contributed) return null;
    return contributed.render(contributedOverlayAnchor(contributed.name));
  }
  }
}
