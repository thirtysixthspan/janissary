import type { Tab } from './types.js';
import { recordLeavingActiveTab as recordLeavingActiveTabOp, popFocusHistory as popFocusHistoryOp, mostRecentFileNavigatorLabel as mostRecentFileNavigatorLabelOp } from './focus-history.js';
import { markUnreadTab } from './transcript-events.js';
import { repairPaneSelections } from './split-selection.js';
import { applyOpenResult as applyOpenResultOp } from './open-result.js';

// The manager operations that decide which tab is selected and maintain the focus history behind
// it. Split out of `manager.ts` when the by-label lookups pushed that file past the size limit;
// these six are a cohesive group, and they follow the same port pattern `operations.ts` uses, so
// the manager keeps every method and signature while the bodies live here.
export type TabSelectionPort = {
  tabs: Tab[];
  activeTab: number;
  secondaryTabLabel?: string;
  focusHistory: string[];
};

export function markUnread(port: TabSelectionPort, label: string): void {
  markUnreadTab(port.tabs, label, port.tabs[port.activeTab]?.label, port.secondaryTabLabel);
}

export function recordLeavingActiveTab(port: TabSelectionPort, newIndex: number): void {
  port.focusHistory = recordLeavingActiveTabOp(port.tabs, port.activeTab, port.focusHistory, newIndex);
}

export function popFocusHistory(
  port: TabSelectionPort, eligible?: (tab: Tab) => boolean,
): number | undefined {
  const { index, history } = popFocusHistoryOp(port.tabs, port.focusHistory, eligible);
  port.focusHistory = history;
  return index;
}

export function repairSelections(port: TabSelectionPort): void {
  const selection = repairPaneSelections(port.tabs, port.activeTab, port.secondaryTabLabel);
  port.activeTab = selection.activeTab;
  port.secondaryTabLabel = selection.secondaryTabLabel;
}

export function mostRecentFileNavigatorLabel(port: TabSelectionPort): string | undefined {
  return mostRecentFileNavigatorLabelOp(port.tabs, port.focusHistory);
}

export function applyOpenResult(
  port: TabSelectionPort, result: { tabs: Tab[]; activeTab: number },
): void {
  const next = applyOpenResultOp(port.tabs, port.activeTab, port.secondaryTabLabel, port.focusHistory, result);
  port.tabs = next.tabs;
  port.activeTab = next.activeTab;
  port.secondaryTabLabel = next.secondaryTabLabel;
  port.focusHistory = next.focusHistory;
}
