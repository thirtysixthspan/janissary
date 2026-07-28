import type { CenterPane, Tab } from '../types.js';

export type SplitState = {
  tabs: Tab[];
  activeLabel: string;
  secondaryLabel?: string;
};

export function centerPane(tab: Tab): CenterPane {
  return tab.pane ?? 'left';
}

export function isCenterActionTab(tab: Tab): boolean {
  return !tab.dock && tab.view !== 'monitor';
}

export function isSplitEligibleTab(tab: Tab): boolean {
  return isCenterActionTab(tab) && tab.view !== 'notifications';
}

export function hasSplit(tabs: Tab[]): boolean {
  return tabs.some((tab) => isSplitEligibleTab(tab) && tab.pane === 'right');
}

function nearestLabel(tabs: Tab[], index: number, pane: CenterPane, excluded: string): string | undefined {
  const candidates = tabs
    .map((tab, candidateIndex) => ({ tab, candidateIndex }))
    .filter(({ tab }) => tab.label !== excluded && isSplitEligibleTab(tab) && centerPane(tab) === pane)
    .toSorted((a, b) => Math.abs(a.candidateIndex - index) - Math.abs(b.candidateIndex - index));
  return candidates[0]?.tab.label;
}

function historyLabel(tabs: Tab[], history: string[], pane: CenterPane, excluded: string): string | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const tab = tabs.find((candidate) => candidate.label === history[index]);
    if (tab && tab.label !== excluded && isSplitEligibleTab(tab) && centerPane(tab) === pane) return tab.label;
  }
  return undefined;
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
    const restored = historyLabel(nextTabs, focusHistory, 'left', targetLabel)
      ?? nearestLabel(nextTabs, targetIndex, 'left', targetLabel);
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

  const previousActive = nextTabs.find((tab) => tab.label === activeLabel);
  const previousSecondary = nextTabs.find((tab) => tab.label === secondaryLabel);
  const restored =
    previousActive && isSplitEligibleTab(previousActive)
      && previousActive.label !== targetLabel && centerPane(previousActive) === sourcePane
      ? previousActive.label
      : previousSecondary && isSplitEligibleTab(previousSecondary)
        && previousSecondary.label !== targetLabel && centerPane(previousSecondary) === sourcePane
        ? previousSecondary.label
        : historyLabel(nextTabs, focusHistory, sourcePane, targetLabel)
          ?? nearestLabel(nextTabs, targetIndex, sourcePane, targetLabel);
  return { tabs: nextTabs, activeLabel: targetLabel, secondaryLabel: restored };
}
