import type React from 'react';
import type { RouteChooserView, TabView } from '@shared/protocol';
import type { OverlayOpenState } from './overlay-registry';
import type { PickerOverlaysState } from './picker-overlays-state';
import type { VisibleTaskRow } from './task-picker-keys';
import type { VisibleProfileRow } from './profile-picker-keys';
import type { FuzzyMatchResult } from '../fuzzy-match';

// The complete prop list of `PickerOverlays`, declared here rather than in that component so the
// hook that owns the state can build the whole bag in one place and the app shell can pass it as a
// single prop. `PickerOverlays` imports this as its own `Properties`.
export type PickerOverlayView = {
  // Which overlays are up, built once by `buildOverlayOpenState` where the picker state lives.
  overlays: OverlayOpenState;
  // The route chooser renders from the view object rather than from `overlays.route`, so the view
  // itself is still a field of its own.
  route: RouteChooserView | null;
  routeIndex: number;
  onPickRoute: (index: number) => void;
  syntaxTheme: string;
  themePickerIndex: number;
  onPickTheme: (name: string) => void;
  theme: string;
  appThemePickerIndex: number;
  onPickAppTheme: (name: string) => void;
  recent: string[];
  pickerIndex: number;
  onPickHistory: (command: string) => void;
  navQuery: string;
  navIndex: number;
  tabs: TabView[];
  onPickTab: (index: number) => void;
  queueItems: string[];
  queueIndex: number;
  onSelectQueue: (index: number) => void;
  taskRows: VisibleTaskRow[];
  taskPickerIndex: number;
  onPickTask: (path: string) => void;
  onToggleTaskDir: (path: string) => void;
  profiles: VisibleProfileRow[];
  profilePickerIndex: number;
  onPickProfile: (name: string) => void;
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

// The one translation from the hooks' vocabulary to the render tree's. Before this existed, the
// same renames — `chooseRoute` to `onPickRoute`, `visibleTasks` to `taskRows`, `visibleProfiles` to
// `profiles`, and the rest — were written out prop by prop in `App.tsx` and again in `AppMain.tsx`.
export function buildPickerOverlayView(state: PickerOverlaysState): PickerOverlayView {
  return {
    overlays: state.overlays,
    route: state.route, routeIndex: state.routeIndex, onPickRoute: state.chooseRoute,
    syntaxTheme: state.syntaxTheme, themePickerIndex: state.themePickerIndex, onPickTheme: state.pickTheme,
    theme: state.theme, appThemePickerIndex: state.appThemePickerIndex, onPickAppTheme: state.pickAppTheme,
    recent: state.recent, pickerIndex: state.pickerIndex, onPickHistory: state.pick,
    navQuery: state.navQuery, navIndex: state.navIndex, tabs: state.tabs, onPickTab: state.selectNavTab,
    queueItems: state.queueItems, queueIndex: state.queueIndex, onSelectQueue: state.selectQueueIndex,
    taskRows: state.visibleTasks, taskPickerIndex: state.taskPickerIndex,
    onPickTask: state.pickTask, onToggleTaskDir: state.toggleTaskDir,
    profiles: state.visibleProfiles, profilePickerIndex: state.profilePickerIndex, onPickProfile: state.pickProfile,
    quickOpenQuery: state.quickOpenQuery, onChangeQuickOpenQuery: state.setQuickOpenQuery,
    quickOpenResults: state.quickOpenResults, quickOpenIndex: state.quickOpenIndex,
    onChangeQuickOpenIndex: state.setQuickOpenIndex, quickOpenLoading: state.quickOpenLoading,
    onPickQuickOpen: state.pickQuickOpenFile, onCloseQuickOpen: state.closeQuickOpen,
    commandInputRef: state.commandInputRef,
  };
}
