import type { Tab } from './types.js';
import { centerPane, isCenterActionTab } from './placement.js';
import { hasSplit } from './split.js';
import { focusedPane, repairPaneSelections } from './split-selection.js';

// `resolveTabs` is passed to `repairPaneSelections` rather than left to its `() => tabs` default
// because the unread dwell it may begin resolves the array when its interval is up, and this path
// hands over an array that a close or reorder can replace wholesale in the meantime — a captured one
// is a detached copy by then, and clearing it would leave the live tab badged for good.
export function applyOpenResult(
  currentTabs: Tab[], currentActive: number, currentSecondary: string | undefined,
  focusHistory: string[], result: { tabs: Tab[]; activeTab: number },
  resolveTabs?: () => Tab[],
): { tabs: Tab[]; activeTab: number; secondaryTabLabel?: string; focusHistory: string[] } {
  const previousActive = currentTabs[currentActive];
  const previousLabels = new Set(currentTabs.map((tab) => tab.label));
  const opened = result.tabs[result.activeTab];
  if (opened && !previousLabels.has(opened.label) && isCenterActionTab(opened)) {
    opened.pane = focusedPane(currentTabs, currentActive) === 'right' ? 'right' : undefined;
  }
  const nextHistory = opened?.label !== previousActive?.label && previousActive
    ? [...focusHistory.filter((label) => label !== previousActive.label), previousActive.label]
    : focusHistory;
  const secondaryTabLabel = opened && previousActive && hasSplit(result.tabs) && centerPane(opened) !== centerPane(previousActive)
    ? previousActive.label
    : currentSecondary;
  const selection = repairPaneSelections(result.tabs, result.activeTab, secondaryTabLabel, resolveTabs);
  return {
    tabs: result.tabs,
    activeTab: selection.activeTab,
    secondaryTabLabel: selection.secondaryTabLabel,
    focusHistory: nextHistory,
  };
}
