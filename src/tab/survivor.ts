import type { CenterPane, Tab } from './types.js';
import { centerPane, isSplitEligibleTab } from './placement.js';

function eligible(tab: Tab | undefined, pane: CenterPane): tab is Tab {
  return tab !== undefined && isSplitEligibleTab(tab) && centerPane(tab) === pane;
}

function candidateLabel(tabs: Tab[], label: string | undefined, pane: CenterPane): string | undefined {
  const tab = tabs.find((candidate) => candidate.label === label);
  return eligible(tab, pane) ? tab.label : undefined;
}

function historyLabel(tabs: Tab[], history: string[], pane: CenterPane): string | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const tab = tabs.find((candidate) => candidate.label === history[index]);
    if (eligible(tab, pane)) return tab.label;
  }
  return undefined;
}

export function selectSurvivor(
  tabs: Tab[],
  pane: CenterPane,
  candidates: (string | undefined)[],
  focusHistory: string[],
): string | undefined {
  for (const label of candidates) {
    const found = candidateLabel(tabs, label, pane);
    if (found) return found;
  }
  const fromHistory = historyLabel(tabs, focusHistory, pane);
  if (fromHistory) return fromHistory;
  return tabs.find((tab) => eligible(tab, pane))?.label;
}
