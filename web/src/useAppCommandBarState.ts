import { useCallback } from 'react';
import type { TabView } from '@shared/protocol';
import type { PluginCommandLineInsertions } from './shared/command-bar/AppCommandBar';
import {
  registerCommandLineInsertion,
  type AppCommandBarState,
  type CommandLineInsertion,
} from './shared/command-bar/app-command-bar-scope';
import { commandBarSuppressed } from './pickers/overlay-registry';
import type { PickerOverlayView } from './pickers/picker/overlay-view';

// The application state every plugin body's command bar reaches, assembled here because the app shell
// is the one place holding all of it. `queueTab` names the tab the queue popup is open over, and each
// body sees the popup only when that tab is its own. Each tab's own command queue is read off the
// state broadcast, so a line another tab queues for a shell reaches that shell however it is shown.
export function useAppCommandBarState(input: {
  intercept: (line: string, sourceTab?: string, sourceVisible?: boolean) => boolean;
  ghostHistory: string[];
  pickers: { view: PickerOverlayView; onEditQueued: (text: string) => void; onDeleteQueued: () => void };
  queueTab: string | undefined;
  tabs: TabView[];
  onFocusTab: (label: string | undefined) => void;
  insertions: PluginCommandLineInsertions;
}): AppCommandBarState {
  const { intercept, ghostHistory, pickers, queueTab, tabs, onFocusTab, insertions } = input;
  const queuedLinesOf = useCallback(
    (label: string) => tabs.find((tab) => tab.label === label)?.commandQueue,
    [tabs],
  );
  const register = useCallback(
    (label: string, handler: CommandLineInsertion) => registerCommandLineInsertion(insertions.current, label, handler),
    [insertions],
  );
  return {
    intercept,
    ghostHistory,
    blockingOverlayOpen: pickers.view.overlays.quickOpen,
    overlayOwnsCommandBar: commandBarSuppressed(pickers.view.overlays),
    onFocusTab,
    queueTab,
    queueOpen: pickers.view.overlays.queue,
    queueIndex: pickers.view.queueIndex,
    queueItems: pickers.view.queueItems,
    onEditQueued: pickers.onEditQueued,
    onDeleteQueued: pickers.onDeleteQueued,
    queuedLinesOf,
    registerCommandLineInsertion: register,
  };
}
