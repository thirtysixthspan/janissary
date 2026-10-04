import { createContext, useCallback, useContext, type ReactNode, type RefObject } from 'react';
import type { TabView } from '@shared/protocol';
import { classifyCommandBarSubmit } from './classify-submit';
import { openCommandBarOverlay } from './bare-openers';
import type { PickerCommands } from './picker-commands';

// The one question a plugin tab's command bar asks the application before it offers a line onward:
// would the application's own bar have handled this instead of sending it? Answered with the same
// classification the agent tab's chain uses, so a bare word opens the same picker, and `quit` — or a
// `close` that would take the last tab with it — opens the same confirmation, from either bar.
export type AppCommandBar = {
  intercept(line: string): boolean;
  ghostHistory: string[];
  blockingOverlayOpen?: boolean;
  overlayOwnsCommandBar?: boolean;
  queueOpen?: boolean;
  queueIndex?: number;
  queueItems?: string[];
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
};

const AppCommandBarContext = createContext<AppCommandBar | null>(null);

export function AppCommandBarProvider({ bar, children }: { bar: AppCommandBar; children: ReactNode }) {
  return <AppCommandBarContext.Provider value={bar}>{children}</AppCommandBarContext.Provider>;
}

// Throws rather than answering "nothing is intercepted": a missing provider is a wiring mistake, and
// answering quietly would leave every plugin bar's `quit` reaching the server unguarded — the one
// thing this surface exists to prevent.
export function useAppCommandBar(): AppCommandBar {
  const bar = useContext(AppCommandBarContext);
  if (bar === null) throw new Error('no AppCommandBarProvider above this plugin tab');
  return bar;
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
}): (line: string) => boolean {
  const {
    tabs, activeTab, openQuitConfirm, guardRef,
    openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
  } = params;

  return useCallback((line: string): boolean => {
    const verdict = classifyCommandBarSubmit(line, tabs, activeTab);
    if (verdict.kind === 'overlay') {
      return openCommandBarOverlay(verdict.command, {
        openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
      });
    }
    if (verdict.kind === 'confirm-quit') { openQuitConfirm(); return true; }
    // A close of one tab is the client's to guard, because only the client knows whether that tab
    // holds unsaved work. The guard declining is not a refusal, so the line runs as it always did.
    if (verdict.kind === 'confirm-close') return guardRef.current?.(verdict.index) === true;
    return false;
  }, [
    tabs, activeTab, openQuitConfirm, guardRef,
    openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
  ]);
}
