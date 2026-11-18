import type { CenterPane, Tab } from './types.js';
import { centerPane, isCenterActionTab, isSplitEligibleTab } from './placement.js';
import { selectSurvivor } from './survivor.js';

export type SplitState = {
  tabs: Tab[];
  activeLabel: string;
  secondaryLabel?: string;
};

export function hasSplit(tabs: Tab[]): boolean {
  return tabs.some((tab) => isSplitEligibleTab(tab) && tab.pane === 'right');
}

export function moveToOtherPane(
  tabs: Tab[],
  targetLabel: string,
  activeLabel: string,
  secondaryLabel: string | undefined,
  focusHistory: string[],
): SplitState | undefined {
  const targetIndex = tabs.findIndex((tab) => tab.label === targetLabel);
  const target = tabs[targetIndex];
  if (!target || !isSplitEligibleTab(target)) return undefined;
  const actionTabs = tabs.filter((tab) => isSplitEligibleTab(tab));
  if (!hasSplit(tabs) && actionTabs.length < 2) return undefined;

  const nextTabs = tabs.map((tab) => ({ ...tab }));
  const nextTarget = nextTabs[targetIndex];
  const sourcePane = centerPane(nextTarget);
  const targetPane: CenterPane = sourcePane === 'left' ? 'right' : 'left';
  nextTarget.pane = targetPane === 'right' ? 'right' : undefined;

  if (!hasSplit(tabs)) {
    const restored = selectSurvivor(nextTabs, 'left', [], focusHistory);
    if (!restored) return undefined;
    return { tabs: nextTabs, activeLabel: targetLabel, secondaryLabel: restored };
  }

  const sourceTabs = nextTabs.filter(
    (tab) => isSplitEligibleTab(tab) && centerPane(tab) === sourcePane,
  );
  if (sourceTabs.length === 0) {
    for (const tab of nextTabs) if (isCenterActionTab(tab)) tab.pane = undefined;
    return { tabs: nextTabs, activeLabel: targetLabel };
  }

  const restored = selectSurvivor(nextTabs, sourcePane, [activeLabel, secondaryLabel], focusHistory);
  return { tabs: nextTabs, activeLabel: targetLabel, secondaryLabel: restored };
}
