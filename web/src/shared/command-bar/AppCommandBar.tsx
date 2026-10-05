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
const AppCommandBarTabContext = createContext<string | undefined>(undefined);

// Provided once, by the app shell. Not published to plugins: a plugin body reads the state through
// `useAppCommandBar`, already narrowed to its own tab.
export function AppCommandBarProvider({ bar, children }: { bar: AppCommandBarState; children: ReactNode }) {
  return <AppCommandBarContext.Provider value={bar}>{children}</AppCommandBarContext.Provider>;
}

// Binds the tab a plugin body renders in. The host wraps every body in one with the label it already
// knows, so a plugin never names a tab to this surface and so cannot name the wrong one.
export function AppCommandBarTabScope({ label, children }: { label: string; children: ReactNode }) {
  return <AppCommandBarTabContext.Provider value={label}>{children}</AppCommandBarTabContext.Provider>;
}

const NO_UNREGISTER = () => {};

// Throws rather than answering "nothing is intercepted": a missing provider is a wiring mistake, and
// answering quietly would leave every plugin bar's `quit` reaching the server unguarded — the one
// thing this surface exists to prevent. The insertion registration is built apart from the rest so it
// keeps one identity while the app re-renders, and a body registering from an effect registers once.
export function useAppCommandBar(): AppCommandBar {
  const state = useContext(AppCommandBarContext);
  const label = useContext(AppCommandBarTabContext);
  const register = state?.registerCommandLineInsertion;
  const registerHere = useCallback(
    (handler: CommandLineInsertion) => (register && label !== undefined ? register(label, handler) : NO_UNREGISTER),
    [register, label],
  );
  const scoped = useMemo(
    () => (state !== null && label !== undefined ? scopeAppCommandBar(state, label, registerHere) : null),
    [state, label, registerHere],
  );
  if (state === null) throw new Error('no AppCommandBarProvider above this plugin tab');
  if (scoped === null) throw new Error('no AppCommandBarTabScope around this plugin tab');
  return scoped;
}

// Builds the interception from the state only the app shell holds. The six openers are read off the
// bag one field at a time and listed as dependencies individually rather than the bag as a whole,
// because the bag is a fresh object on every render and depending on it would hand every mounted
// plugin body a new callback each time the app re-rendered.
export function useAppCommandLine(params: PickerCommands & {
  tabs: TabView[];
  activeTab: number;
  openQuitConfirm: () => void;
  guardRef: RefObject<((index: number) => boolean) | null>;
  onPickerOpen?: (sourceTab: string | undefined) => void;
}): (line: string, sourceTab?: string) => boolean {
  const {
    tabs, activeTab, openQuitConfirm, guardRef,
    openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
    onPickerOpen, navOpen, setNavOpen, openTabNavWithQuery,
  } = params;

  return useCallback((line: string, sourceTab?: string): boolean => {
    const verdict = classifyCommandBarSubmit(line, tabs, activeTab, sourceTab);
    if (verdict.kind === 'overlay') {
      const opened = openCommandBarOverlay(verdict.command, {
        openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
      });
      if (opened) onPickerOpen?.(sourceTab);
      return opened;
    }
    if (verdict.kind === 'confirm-quit') { openQuitConfirm(); return true; }
    // A close of one tab is the client's to guard, because only the client knows whether that tab
    // holds unsaved work. The guard declining is not a refusal, so the line runs as it always did.
    if (verdict.kind === 'confirm-close') return guardRef.current?.(verdict.index) === true;
    const navQuery = navCommandQuery(line);
    if (navQuery === undefined) return false;
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
