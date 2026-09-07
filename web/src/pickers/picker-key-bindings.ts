import type { OverlayOpenSources } from './overlay-registry';
import type { PickerOverlaysState } from './picker-overlays-state';
import type { VisibleTaskRow } from './task-picker-keys';
import type { VisibleProfileRow } from './profile-picker-keys';
import type { TabNavEntry } from '../tab-nav-match';

// The picker half of the window key handler's live snapshot. The nine open/closed values come from
// `OverlayOpenSources` rather than being restated, so a tenth overlay added to the registry stops
// this from compiling until the new state is threaded through. `useWindowKeys` adds the two fields
// that are not an overlay's (`canSearch`, `searchOpen`) and calls the result `StateSnapshot`.
//
// The `*Idx` names are the handlers' own vocabulary, kept as they are; `buildPickerKeyBindings` below
// is the single place they are translated from the hooks' `*Index`.
export type PickerKeySnapshot = OverlayOpenSources & {
  pickerIdx: number;
  recent: string[];
  routeIdx: number;
  themePickerIdx: number;
  appThemePickerIdx: number;
  navQuery: string;
  navIdx: number;
  navTabs: TabNavEntry[];
  queueIdx: number;
  queueItems: string[];
  taskPickerIdx: number;
  visibleTasks: VisibleTaskRow[];
  profilePickerIdx: number;
  profiles: VisibleProfileRow[];
};

// The picker half of the window key handler's callbacks. `useWindowKeys` adds `openSearch` — the one
// callback no overlay owns — and calls the result `Callbacks`.
export type PickerKeyCallbacks = {
  setRouteIndex: (setter: (prev: number) => number) => void;
  chooseRoute: (index: number) => void;
  runCommand: (text: string) => void;
  setPickerIndex: (setter: (prev: number) => number) => void;
  setPickerOpen: (open: boolean) => void;
  openPicker: () => void;
  setThemePickerIndex: (setter: (prev: number) => number) => void;
  setThemePickerOpen: (open: boolean) => void;
  pickTheme: (name: string) => void;
  setAppThemePickerIndex: (setter: (prev: number) => number) => void;
  setAppThemePickerOpen: (open: boolean) => void;
  pickAppTheme: (name: string) => void;
  setNavIndex: (setter: (prev: number) => number) => void;
  setNavQuery: (query: string) => void;
  selectNavTab: (index: number) => void;
  setNavOpen: (open: boolean) => void;
  openTabNav: () => void;
  setQueueIndex: (setter: (prev: number) => number) => void;
  setQueueOpen: (open: boolean) => void;
  openQueue: () => void;
  setTaskPickerIndex: (setter: (prev: number) => number) => void;
  setTaskPickerOpen: (open: boolean) => void;
  openTaskPicker: () => void;
  pickTask: (path: string) => void;
  toggleTaskDir: (path: string) => void;
  setProfilePickerIndex: (setter: (prev: number) => number) => void;
  setProfilePickerOpen: (open: boolean) => void;
  openProfilePicker: () => void;
  pickProfile: (name: string) => void;
  openQuickOpen: () => void;
};

// The one translation from the hooks' state to the key handler's snapshot and callbacks. This was
// the ~14-line literal in `App.tsx` that filled `useAppWindowKeys`'s deps by hand, restating every
// index and row list a third time under a second set of names.
export function buildPickerKeyBindings(state: PickerOverlaysState): PickerKeySnapshot & PickerKeyCallbacks {
  return {
    route: state.route, themePickerOpen: state.themePickerOpen, appThemePickerOpen: state.appThemePickerOpen,
    quickOpenOpen: state.quickOpenOpen, navOpen: state.navOpen, pickerOpen: state.pickerOpen,
    queueOpen: state.queueOpen, taskPickerOpen: state.taskPickerOpen, profilePickerOpen: state.profilePickerOpen,
    routeIdx: state.routeIndex, pickerIdx: state.pickerIndex, recent: state.recent,
    themePickerIdx: state.themePickerIndex, appThemePickerIdx: state.appThemePickerIndex,
    navQuery: state.navQuery, navIdx: state.navIndex, navTabs: state.navTabs,
    queueIdx: state.queueIndex, queueItems: state.queueItems,
    taskPickerIdx: state.taskPickerIndex, visibleTasks: state.visibleTasks,
    profilePickerIdx: state.profilePickerIndex, profiles: state.visibleProfiles,
    setRouteIndex: state.setRouteIndex, chooseRoute: state.chooseRoute, runCommand: state.runCommand,
    setPickerIndex: state.setPickerIndex, setPickerOpen: state.setPickerOpen, openPicker: state.openPicker,
    setThemePickerIndex: state.setThemePickerIndex, setThemePickerOpen: state.setThemePickerOpen,
    pickTheme: state.pickTheme,
    setAppThemePickerIndex: state.setAppThemePickerIndex, setAppThemePickerOpen: state.setAppThemePickerOpen,
    pickAppTheme: state.pickAppTheme,
    setNavIndex: state.setNavIndex, setNavQuery: state.setNavQuery, selectNavTab: state.selectNavTab,
    setNavOpen: state.setNavOpen, openTabNav: state.openTabNav,
    setQueueIndex: state.setQueueIndex, setQueueOpen: state.setQueueOpen, openQueue: state.openQueue,
    setTaskPickerIndex: state.setTaskPickerIndex, setTaskPickerOpen: state.setTaskPickerOpen,
    openTaskPicker: state.openTaskPicker, pickTask: state.pickTask, toggleTaskDir: state.toggleTaskDir,
    setProfilePickerIndex: state.setProfilePickerIndex, setProfilePickerOpen: state.setProfilePickerOpen,
    openProfilePicker: state.openProfilePicker, pickProfile: state.pickProfile,
    openQuickOpen: state.openQuickOpen,
  };
}
