import type { CenterPane, Tab } from './types.js';
import { centerPane, isCenterActionTab, moveToOtherPane } from './split.js';
import { applyProfileTabPanes, resolveProfileTabFocus } from './place-profile-tabs.js';

export function focusedPane(tabs: Tab[], activeTab: number): CenterPane {
  const active = tabs[activeTab];
  return active && isCenterActionTab(active) ? centerPane(active) : 'left';
}

export function recentLabel(
  tabs: Tab[], focusHistory: string[], eligible: (tab: Tab) => boolean, excluded?: string,
): string | undefined {
  for (let index = focusHistory.length - 1; index >= 0; index--) {
    const label = focusHistory[index];
    const tab = tabs.find((candidate) => candidate.label === label);
    if (tab && label !== excluded && eligible(tab)) return label;
  }
  return tabs.find((tab) => tab.label !== excluded && eligible(tab))?.label;
}

export function repairPaneSelections(
  tabs: Tab[], activeTab: number, secondaryTabLabel?: string,
): { activeTab: number; secondaryTabLabel?: string } {
  const centerTabs = tabs.filter((tab) => isCenterActionTab(tab));
  const leftTabs = centerTabs.filter((tab) => centerPane(tab) === 'left');
  const rightTabs = centerTabs.filter((tab) => centerPane(tab) === 'right');
  if (leftTabs.length === 0 || rightTabs.length === 0) {
    for (const tab of centerTabs) tab.pane = undefined;
    return { activeTab, secondaryTabLabel: undefined };
  }
  let nextActiveTab = activeTab;
  const active = tabs[nextActiveTab];
  nextActiveTab = !active || !isCenterActionTab(active) ? tabs.findIndex((tab) => tab.label === leftTabs[0].label) : nextActiveTab;
  const liveActive = tabs[nextActiveTab];
  const oppositePane: CenterPane = centerPane(liveActive) === 'left' ? 'right' : 'left';
  const secondary = tabs.find((tab) => tab.label === secondaryTabLabel);
  const nextSecondary = !secondary || !isCenterActionTab(secondary) || centerPane(secondary) !== oppositePane || secondary.label === liveActive.label
    ? centerTabs.find((tab) => centerPane(tab) === oppositePane)?.label
    : secondaryTabLabel;
  liveActive.hasUnread = false;
  const visible = tabs.find((tab) => tab.label === nextSecondary);
  if (visible) visible.hasUnread = false;
  return { activeTab: nextActiveTab, secondaryTabLabel: nextSecondary };
}

export function moveTabToOtherPaneSelection(
  tabs: Tab[], targetLabel: string, activeLabel: string, secondaryTabLabel: string | undefined, focusHistory: string[],
): { tabs: Tab[]; activeLabel: string; secondaryLabel?: string } | undefined {
  return moveToOtherPane(tabs, targetLabel, activeLabel, secondaryTabLabel, focusHistory);
}

export function placeProfileTabSelection(
  tabs: Tab[], activeTab: number, candidates: { label: string; number?: number; pane?: CenterPane }[],
  findIndex: (label: string) => number,
): { activeTab?: number; secondaryTabLabel?: string } {
  applyProfileTabPanes(tabs, candidates);
  const focus = resolveProfileTabFocus(tabs, activeTab, candidates, findIndex);
  return { activeTab: focus.activeTab, secondaryTabLabel: focus.secondaryTabLabel };
}
