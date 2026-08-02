import type { Tab } from './types.js';
import { centerPane, hasSplit, isCenterActionTab } from './split.js';
import { focusedPane, repairPaneSelections } from './split-selection.js';

export function applyOpenResult(
  currentTabs: Tab[], currentActive: number, currentSecondary: string | undefined,
  focusHistory: string[], result: { tabs: Tab[]; activeTab: number },
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
  const selection = repairPaneSelections(result.tabs, result.activeTab, secondaryTabLabel);
  return {
    tabs: result.tabs,
    activeTab: selection.activeTab,
    secondaryTabLabel: selection.secondaryTabLabel,
    focusHistory: nextHistory,
  };
}
