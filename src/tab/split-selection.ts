import type { CenterPane, Tab } from './types.js';
import { centerPane, isCenterActionTab } from './placement.js';
import { moveToOtherPane } from './split.js';
import { applyProfileTabPanes, resolveProfileTabFocus } from './place-profile-tabs.js';
import { beginDwell } from './dwell.js';
import { clearUnreadTab } from './transcript/events.js';

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
  tabs: Tab[], activeTab: number, secondaryTabLabel?: string, resolveTabs?: () => Tab[],
): { activeTab: number; secondaryTabLabel?: string } {
  // Whoever ends up selected is being looked at, so it starts its unread dwell — and that is true of
  // both shapes. On a strip with no split there is nothing to swap between panes, so the tab that is
  // active is the one the caller passed in; naming it needs none of the pane filtering below. The
  // call sits above the unsplit early return so `open` dwells the same tab a click does, since a
  // badge that never comes off here is a badge the user cannot clear by looking at the tab — and a
  // harness that finished in that state is badged for the session and never escalated.
  const resolve = resolveTabs ?? (() => tabs);
  const selected = tabs[activeTab];
  if (selected) beginDwell(resolve, selected.label);
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
  // Only the split shape reaches here, and only it has a second pane to account for. The tab left
  // showing in the other pane is on screen without being visited — the same judgement
  // `markUnreadTab` makes by refusing to badge it at all — and it can never complete a dwell of its
  // own, so its badge comes off now. The selected tab's own badge waits out the dwell begun above.
  const visible = tabs.find((tab) => tab.label === nextSecondary);
  if (visible) clearUnreadTab(tabs, visible.label);
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
