import { createContext, useCallback, useContext, useMemo, type ReactNode, type RefObject } from 'react';
import type { TabView } from '@shared/protocol';
import { classifyCommandBarSubmit, navCommandQuery } from './classify-submit';
import { openCommandBarOverlay } from './bare-openers';
import type { PickerCommands } from './picker-commands';
import {
  scopeAppCommandBar,
  type AppCommandBar,
  type AppCommandBarState,
  type CommandLineInsertion,
} from './app-command-bar-scope';

export type PluginCommandLineInsertions = { current: Map<string, CommandLineInsertion> };

const AppCommandBarContext = createContext<AppCommandBarState | null>(null);
// The tab a plugin body renders in, and whether that body is on screen.
type TabScope = { label: string; active: boolean };
const AppCommandBarTabContext = createContext<TabScope | undefined>(undefined);

// Provided once, by the app shell. Not published to plugins: a plugin body reads the state through
// `useAppCommandBar`, already narrowed to its own tab.
export function AppCommandBarProvider({ bar, children }: { bar: AppCommandBarState; children: ReactNode }) {
  return <AppCommandBarContext.Provider value={bar}>{children}</AppCommandBarContext.Provider>;
}

// Binds the tab a plugin body renders in. The host wraps every body in one with the label it already
// knows, so a plugin never names a tab to this surface and so cannot name the wrong one. `active` is
// the host's own answer to whether that body is on screen, which decides whether a picker its bar asks
// for may open; it defaults to on screen.
export function AppCommandBarTabScope({ label, active = true, children }: {
  label: string; active?: boolean; children: ReactNode;
}) {
  const scope = useMemo(() => ({ label, active }), [label, active]);
  return <AppCommandBarTabContext.Provider value={scope}>{children}</AppCommandBarTabContext.Provider>;
}

const NO_UNREGISTER = () => {};

// Throws rather than answering "nothing is intercepted": a missing provider is a wiring mistake, and
// answering quietly would leave every plugin bar's `quit` reaching the server unguarded — the one
// thing this surface exists to prevent. The insertion registration is built apart from the rest so it
// keeps one identity while the app re-renders, and a body registering from an effect registers once.
export function useAppCommandBar(): AppCommandBar {
  const state = useContext(AppCommandBarContext);
  const tab = useContext(AppCommandBarTabContext);
  const label = tab?.label;
  const active = tab?.active ?? true;
  const register = state?.registerCommandLineInsertion;
  const registerHere = useCallback(
    (handler: CommandLineInsertion) => (register && label !== undefined ? register(label, handler) : NO_UNREGISTER),
    [register, label],
  );
  const scoped = useMemo(
    () => (state !== null && label !== undefined ? scopeAppCommandBar(state, label, registerHere, active) : null),
    [state, label, registerHere, active],
  );
  if (state === null) throw new Error('no AppCommandBarProvider above this plugin tab');
  if (scoped === null) throw new Error('no AppCommandBarTabScope around this plugin tab');
  return scoped;
}

// Builds the interception from the state only the app shell holds. The six openers are read off the
// bag one field at a time and listed as dependencies individually rather than the bag as a whole,
// because the bag is a fresh object on every render and depending on it would hand every mounted
// plugin body a new callback each time the app re-rendered.
//
// A source that is not on screen opens nothing: a picker drawn over a hidden body would be seen by no
// one yet still take arrow, Return and Escape from whatever tab is in front. Its picker word is answered
// as handled all the same, as the server answers an interactive picker word it receives, so a shell
// draining its queue in the background records the line and moves on.
export function useAppCommandLine(params: PickerCommands & {
  tabs: TabView[];
  activeTab: number;
  openQuitConfirm: () => void;
  guardRef: RefObject<((index: number) => boolean) | null>;
  onPickerOpen?: (sourceTab: string | undefined) => void;
}): (line: string, sourceTab?: string, sourceVisible?: boolean) => boolean {
  const {
    tabs, activeTab, openQuitConfirm, guardRef,
    openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
    onPickerOpen, navOpen, setNavOpen, openTabNavWithQuery,
  } = params;

  return useCallback((line: string, sourceTab?: string, sourceVisible = true): boolean => {
    const verdict = classifyCommandBarSubmit(line, tabs, activeTab, sourceTab);
    if (verdict.kind === 'overlay') {
      if (!sourceVisible) return true;
      const opened = openCommandBarOverlay(verdict.command, {
        openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
      }, sourceTab);
      if (opened) onPickerOpen?.(sourceTab);
      return opened;
    }
    if (verdict.kind === 'confirm-quit') { openQuitConfirm(); return true; }
    // A close of one tab is the client's to guard, because only the client knows whether that tab
    // holds unsaved work. The guard declining is not a refusal, so the line runs as it always did.
    if (verdict.kind === 'confirm-close') return guardRef.current?.(verdict.index) === true;
    const navQuery = navCommandQuery(line);
    if (navQuery === undefined) return false;
    if (!sourceVisible) return true;
    if (navOpen) {
      setNavOpen(false);
    } else {
      openTabNavWithQuery(navQuery);
      onPickerOpen?.(sourceTab);
    }
    return true;
  }, [
    tabs, activeTab, openQuitConfirm, guardRef,
    openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker, onPickerOpen,
    navOpen, setNavOpen, openTabNavWithQuery,
  ]);
}
