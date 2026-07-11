import { useEffect } from 'react';
import type { JanusClient } from './ws';
import type { RouteChooserView } from '@shared/protocol';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { APP_THEMES } from '@shared/app-themes';
import { handleRouteChooserKey, handlePickerKey, handleTabNavKey, handleQueueKey } from './keyboard-handlers';
import { dispatchTaskPickerKey, type VisibleTaskRow } from './task-picker-keys';
import type { TabNavEntry } from './TabNavPicker';

export type StateSnapshot = {
  pickerOpen: boolean;
  pickerIdx: number;
  recent: string[];
  route: RouteChooserView | null;
  routeIdx: number;
  // Whether the active tab shows the transcript body (Cmd+F is only meaningful there) and
  // whether search mode is currently open (gates scroll-key handling so Arrow keys reach the
  // search bar instead of scrolling the transcript underneath it).
  canSearch: boolean;
  searchOpen: boolean;
  themePickerOpen: boolean;
  themePickerIdx: number;
  appThemePickerOpen: boolean;
  appThemePickerIdx: number;
  navOpen: boolean;
  navQuery: string;
  navIdx: number;
  navTabs: TabNavEntry[];
  queueOpen: boolean;
  queueIdx: number;
  queueItems: string[];
  taskPickerOpen: boolean;
  taskPickerIdx: number;
  visibleTasks: VisibleTaskRow[];
  profilePickerOpen: boolean;
  profilePickerIdx: number;
  profiles: string[];
};

export type Callbacks = {
  setRouteIndex: (setter: (prev: number) => number) => void;
  chooseRoute: (index: number) => void;
  runCommand: (text: string) => void;
  setPickerIndex: (setter: (prev: number) => number) => void;
  setPickerOpen: (open: boolean) => void;
  openPicker: () => void;
  openSearch: () => void;
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
};

// Priority chain of pickers/choosers that claim every keystroke while open. Returns true once one
// of them has handled the key, so the caller stops there.
function dispatchModalKey(e: KeyboardEvent, snap: StateSnapshot, cb: Callbacks): boolean {
  if (snap.route) {
    handleRouteChooserKey(e, snap.route, snap.routeIdx, cb.setRouteIndex, cb.chooseRoute);
    return true;
  }
  if (snap.themePickerOpen) {
    handlePickerKey(e, SYNTAX_THEMES, snap.themePickerIdx, cb.setThemePickerIndex, cb.pickTheme, cb.setThemePickerOpen);
    return true;
  }
  if (snap.appThemePickerOpen) {
    handlePickerKey(e, APP_THEMES, snap.appThemePickerIdx, cb.setAppThemePickerIndex, cb.pickAppTheme, cb.setAppThemePickerOpen);
    return true;
  }
  if (snap.navOpen) {
    handleTabNavKey(e, snap.navTabs, snap.navIdx, cb.setNavIndex, cb.selectNavTab, cb.setNavOpen, snap.navQuery, cb.setNavQuery);
    return true;
  }
  if (snap.pickerOpen) {
    handlePickerKey(e, snap.recent, snap.pickerIdx, cb.setPickerIndex, cb.runCommand, cb.setPickerOpen);
    return true;
  }
  if (snap.queueOpen) {
    handleQueueKey(e, snap.queueItems, snap.queueIdx, cb.setQueueIndex, cb.setQueueOpen);
    return true;
  }
  if (snap.taskPickerOpen) {
    dispatchTaskPickerKey(e, snap.visibleTasks, snap.taskPickerIdx, cb.setTaskPickerIndex, cb.toggleTaskDir, cb.pickTask, cb.setTaskPickerOpen);
    return true;
  }
  if (snap.profilePickerOpen) {
    handlePickerKey(e, snap.profiles, snap.profilePickerIdx, cb.setProfilePickerIndex, cb.pickProfile, cb.setProfilePickerOpen);
    return true;
  }
  return false;
}

// Ctrl/Shift+Arrow tab reorder/move shortcuts and Ctrl+T tool-step collapse — the tail of the key
// handler once no picker/chooser/search state intercepts the key.
function handleTabShortcuts(e: KeyboardEvent, client: JanusClient): void {
  if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
  else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
  else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
  else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
  else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
}

// The Ctrl-key picker openers (Ctrl+R history, Ctrl+G nav, Ctrl+E queue, Ctrl+A tasks), keyed by
// letter so the chord list stays flat and under the file's cognitive-complexity threshold.
function ctrlChordOpener(key: string, cb: Callbacks): (() => void) | undefined {
  switch (key) {
  case 'r': { return cb.openPicker; }
  case 'g': { return cb.openTabNav; }
  case 'e': { return cb.openQueue; }
  case 'a': { return cb.openTaskPicker; }
  }
}

// The chord openers (Cmd+F search, the Ctrl picker chords, Cmd+T new agent tab) — split out of
// `onKey` to keep its own cognitive complexity under the file's lint threshold.
function handleChordKeys(e: KeyboardEvent, snap: StateSnapshot, cb: Callbacks): boolean {
  if (e.metaKey && e.key.toLowerCase() === 'f') {
    if (!snap.canSearch) return true;
    e.preventDefault();
    if (!snap.searchOpen) cb.openSearch();
    return true;
  }
  if (e.ctrlKey) {
    const opener = ctrlChordOpener(e.key.toLowerCase(), cb);
    if (opener) { e.preventDefault(); opener(); return true; }
  }
  if (e.metaKey && e.key.toLowerCase() === 't') { e.preventDefault(); cb.runCommand('agent'); return true; }
  return false;
}

export function useWindowKeys(
  client: JanusClient,
  stateRef: React.RefObject<StateSnapshot>,
  callbacksRef: React.RefObject<Callbacks>,
  handleScrollKey: (e: KeyboardEvent) => boolean,
  handleScrollKeyUp: (e: KeyboardEvent) => void,
) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const snap = stateRef.current;
      const cb = callbacksRef.current;
      if (!snap || !cb) return;
      if (dispatchModalKey(e, snap, cb)) return;
      if (handleChordKeys(e, snap, cb)) return;
      if (!snap.searchOpen && handleScrollKey(e)) return;
      handleTabShortcuts(e, client);
    };
    globalThis.addEventListener('keydown', onKey);
    globalThis.addEventListener('keyup', handleScrollKeyUp);
    return () => {
      globalThis.removeEventListener('keydown', onKey);
      globalThis.removeEventListener('keyup', handleScrollKeyUp);
    };
  }, [client, stateRef, callbacksRef, handleScrollKey, handleScrollKeyUp]);
}
