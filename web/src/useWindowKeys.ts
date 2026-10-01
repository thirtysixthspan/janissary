import { useEffect } from 'react';
import type { JanusClient } from './ws';
import { SYNTAX_THEMES } from '@shared/syntax-themes';
import { APP_THEMES } from '@shared/app-themes';
import { handleRouteChooserKey, handlePickerKey, handleTabNavKey, handleQueueKey } from './keyboard-handlers';
import { dispatchTaskPickerKey } from './pickers/task-picker-keys';
import { dispatchProfilePickerKey } from './pickers/profile-picker-keys';
import { buildOverlayOpenState, firstOpenOverlay } from './pickers/overlay-registry';
import { eventChordId } from './overlay-plugins/chords';
import { openOverlayForChord, contributedOverlayOnScreen } from './shared/contributed-overlays';
import { isTabSwitchChord } from './shared/terminal/window-chords';
import { appChordAction, type AppChordAction } from './shared/app-chords';
import type { PickerKeySnapshot, PickerKeyCallbacks } from './pickers/picker/key-bindings';

// Every overlay-owned field comes from `pickers/picker-key-bindings`, where the hook that owns the
// picker state builds it, rather than being restated here and again at the call site. What is left
// is the two fields no overlay owns:
export type StateSnapshot = PickerKeySnapshot & {
  // Whether the active tab shows the transcript body (Cmd+F is only meaningful there) and
  // whether search mode is currently open (gates scroll-key handling so Arrow keys reach the
  // search bar instead of scrolling the transcript underneath it).
  canSearch: boolean;
  searchOpen: boolean;
};

export type Callbacks = PickerKeyCallbacks & {
  openSearch: () => void;
};

// Priority chain of pickers/choosers that claim every keystroke while open. Returns true once one
// of them has claimed the key, so the caller stops there. Which one wins comes from the same ordered
// registry the render chain reads (see `pickers/overlay-registry`), not from the order written here.
function dispatchModalKey(e: KeyboardEvent, snap: StateSnapshot, cb: Callbacks): boolean {
  switch (firstOpenOverlay(buildOverlayOpenState(snap))) {
  // `snap.route` is what put this case in play, so it is non-null here; the compiler cannot see
  // that across the registry lookup.
  case 'route': {
    handleRouteChooserKey(e, snap.route!, snap.routeIdx, cb.setRouteIndex, cb.chooseRoute);
    return true;
  }
  case 'syntaxTheme': {
    handlePickerKey(e, SYNTAX_THEMES, snap.themePickerIdx, cb.setThemePickerIndex, cb.pickTheme, cb.setThemePickerOpen);
    return true;
  }
  case 'appTheme': {
    handlePickerKey(e, APP_THEMES, snap.appThemePickerIdx, cb.setAppThemePickerIndex, cb.pickAppTheme, cb.setAppThemePickerOpen);
    return true;
  }
  // Quick open holds its own text input and stops propagation on it, so keys typed into it never
  // reach this handler at all. Claiming the key here is for the ones that arrive when focus is
  // elsewhere: they must not fall through to a chord or a tab shortcut underneath the overlay.
  case 'quickOpen': { return true; }
  case 'tabNav': {
    handleTabNavKey(e, snap.navTabs, snap.navIdx, cb.setNavIndex, cb.selectNavTab, cb.setNavOpen, snap.navQuery, cb.setNavQuery);
    return true;
  }
  case 'history': {
    handlePickerKey(e, snap.recent, snap.pickerIdx, cb.setPickerIndex, cb.runCommand, cb.setPickerOpen);
    return true;
  }
  case 'queue': {
    handleQueueKey(e, snap.queueItems, snap.queueIdx, cb.setQueueIndex, cb.setQueueOpen);
    return true;
  }
  case 'task': {
    dispatchTaskPickerKey(e, snap.visibleTasks, snap.taskPickerIdx, cb.setTaskPickerIndex, cb.toggleTaskDir, cb.pickTask, cb.setTaskPickerOpen);
    return true;
  }
  case 'profile': {
    dispatchProfilePickerKey(
      e, snap.profiles, snap.profilePickerIdx,
      cb.setProfilePickerIndex, cb.pickProfile, cb.setProfilePickerOpen,
    );
    return true;
  }
  default: {
    // No built-in overlay is up, which is the only condition under which a contributed one can be:
    // the registry ranks the nine above every plugin, so nothing below this line fires while one of
    // them is open — including the chords that open them.
    const contributed = contributedOverlayOnScreen();
    if (!contributed) return false;
    contributed.onKey(e);
    return true;
  }
  }
}

// Ctrl/Shift+Arrow tab reorder/move shortcuts, Ctrl+T tool-step collapse, and Ctrl+O open-in-terminal
// — the tail of the key handler once no picker/chooser/search state intercepts the key.
function handleTabShortcuts(e: KeyboardEvent, client: JanusClient): void {
  if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
  else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
  // Shift+←/→ and Cmd+Shift+[/] — the one tab-switch definition the full-tab terminals also read to
  // decide which keys to let bubble here.
  else if (isTabSwitchChord(e)) { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: tabSwitchDirection(e.key) } }); }
  else if (e.ctrlKey) { ctrlLetterShortcut(e, client); }
}

function tabSwitchDirection(key: string): -1 | 1 {
  return ['ArrowLeft', '[', '{'].includes(key) ? -1 : 1;
}

// The plain Ctrl+letter sends (Ctrl+T tool-step collapse, Ctrl+O open-in-terminal), split out of
// `handleTabShortcuts` to keep its cognitive complexity under the file's lint threshold. Both go
// out unconditionally: the server already no-ops when the action does not apply, so gating them
// here would duplicate a decision the server owns.
function ctrlLetterShortcut(e: KeyboardEvent, client: JanusClient): void {
  const key = e.key.toLowerCase();
  if (key === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
  else if (key === 'o') { e.preventDefault(); client.send({ method: 'promoteToTerminal', params: {} }); }
}

// The chords this handler dispatches, resolved through `shared/app-chords.ts` — the same table the
// overlay-plugin host reads to refuse a chord the application already owns. Routing on the action rather
// than on key and modifier comparisons is what keeps the two in step: an action added to the table with no
// case below narrows the default branch to `never`, which is a compile error rather than a chord that
// silently stops working.
function ctrlChordOpener(action: AppChordAction | undefined, cb: Callbacks): (() => void) | undefined {
  switch (action) {
  // Most Ctrl chords are not application chords — Ctrl+T, Ctrl+O and the tab moves are dispatched further
  // down by `handleTabShortcuts` — so "none of these" is an ordinary answer, not a missing case.
  case undefined: { return undefined; }
  case 'history': { return cb.openPicker; }
  case 'tabNav': { return cb.openTabNav; }
  case 'queue': { return cb.openQueue; }
  case 'tasks': { return cb.openTaskPicker; }
  default: { return exhaust(action); }
  }
}

// The Cmd-key chords (Cmd+Shift+F project search, Cmd+F transcript search, Cmd+P quick open, Cmd+T new
// agent tab) — split out of `handleChordKeys` to keep its own cognitive complexity under the file's lint
// threshold.
//
// The two `f` chords are separate table entries rather than one branch testing `shiftKey`, which is what
// makes the project search reachable at all: the transcript search below matches on the key alone, so an
// ordering inside a single branch was the only thing keeping Cmd+Shift+F from opening it instead. Both run
// the same plugin command the user could type, so there is one route into that tab rather than two.
function metaChordOpener(e: KeyboardEvent, snap: StateSnapshot, cb: Callbacks): boolean {
  const action = appChordAction(eventChordId(e));
  switch (action) {
  // Not an application chord: the Cmd+Shift bracket tab moves belong to `handleTabShortcuts`, and every
  // other Cmd combination is either a browser shortcut or nothing at all.
  case undefined: { return false; }
  case 'projectSearch': {
    e.preventDefault();
    cb.runCommand('search');
    return true;
  }
  case 'transcriptSearch': {
    if (!snap.canSearch) return true;
    e.preventDefault();
    if (!snap.searchOpen) cb.openSearch();
    return true;
  }
  case 'quickOpen': {
    e.preventDefault();
    if (!snap.quickOpenOpen) cb.openQuickOpen();
    return true;
  }
  case 'newAgentTab': {
    e.preventDefault();
    cb.runCommand('agent');
    return true;
  }
  // Shift+Tab belongs to `useSectionNav`, which claims it inside a dialog and not here. Saying so is the
  // point of the table carrying an owner: the chord is reserved, and this handler is not what fires it.
  case 'sectionNav': { return false; }
  default: { return exhaust(action); }
  }
}

// Narrowing to `never` is the whole guarantee: a new `AppChordAction` with no case above fails to compile
// here rather than becoming a chord the application reserves and nothing dispatches.
function exhaust(action: AppChordAction | undefined): never {
  throw new Error(`unhandled application chord action: ${String(action)}`);
}

// The chord openers (Cmd+Shift+F search, Cmd+F search, Cmd+P quick open, the Ctrl picker chords,
// Cmd+T new agent tab) — split out of `onKey` to keep its own cognitive complexity under the file's
// lint threshold. A plugin's chord is consulted after all of them, so a core chord always wins.
//
// `preventDefault` on a claimed plugin chord is not optional here. In a text field — which is exactly
// where an editor keeps its keyboard — a browser binds Ctrl+Shift+V to "paste as plain text", and the
// keydown still reaches the page: without it the popup would open *and* the browser would paste, in
// one keystroke, with nothing in the popup looking wrong.
function handleChordKeys(e: KeyboardEvent, snap: StateSnapshot, cb: Callbacks): boolean {
  if (e.metaKey && metaChordOpener(e, snap, cb)) return true;
  if (e.ctrlKey) {
    const opener = ctrlChordOpener(appChordAction(eventChordId(e)), cb);
    if (opener) { e.preventDefault(); opener(); return true; }
  }
  if (!e.isComposing && openOverlayForChord(eventChordId(e))) { e.preventDefault(); return true; }
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
      // Quick open no longer needs naming here: `dispatchModalKey` claims its keys above, which is
      // what this guard was patching around while it was missing from that chain.
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

