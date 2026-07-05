import { useEffect } from 'react';
import type { JanusClient } from './ws';
import type { RouteChooserView } from '@shared/protocol';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { handleRouteChooserKey, handlePickerKey } from './keyboard-handlers';

type StateSnapshot = {
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
};

type Callbacks = {
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
};

// Ctrl/Shift+Arrow tab reorder/move shortcuts and Ctrl+T tool-step collapse — the tail of the key
// handler once no picker/chooser/search state intercepts the key.
function handleTabShortcuts(e: KeyboardEvent, client: JanusClient): void {
  if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
  else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
  else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
  else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
  else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
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
      if (snap.route) {
        handleRouteChooserKey(e, snap.route, snap.routeIdx, cb.setRouteIndex, cb.chooseRoute);
        return;
      }
      if (snap.themePickerOpen) {
        handlePickerKey(e, SYNTAX_THEMES, snap.themePickerIdx, cb.setThemePickerIndex, cb.pickTheme, cb.setThemePickerOpen);
        return;
      }
      if (snap.pickerOpen) {
        handlePickerKey(e, snap.recent, snap.pickerIdx, cb.setPickerIndex, cb.runCommand, cb.setPickerOpen);
        return;
      }
      if (e.metaKey && e.key.toLowerCase() === 'f') {
        if (!snap.canSearch) return;
        e.preventDefault();
        if (!snap.searchOpen) cb.openSearch();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); cb.openPicker(); return; }

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
