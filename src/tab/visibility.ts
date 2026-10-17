import type { Tab } from './types.js';
import type { TabSelectionPort } from './selection-operations.js';
import { centerPane, isCenterActionTab } from './placement.js';
import { focusedPane } from './split-selection.js';
import { applyDock } from './dock.js';
import { repairSelections } from './selection-operations.js';

type VisibilityPort = TabSelectionPort & {
  recordLeavingActiveTab(index: number): void;
};

function replacement(port: TabSelectionPort, index: number): string | undefined {
  const pane = centerPane(port.tabs[index]);
  const eligible = (tab: Tab) => isCenterActionTab(tab) && centerPane(tab) === pane;
  for (const label of port.focusHistory.toReversed()) {
    if (port.tabs.some((tab) => tab.label === label && eligible(tab))) return label;
  }
  const nearest = (samePane: boolean) => port.tabs
    .map((tab, position) => ({ tab, position }))
    .filter(({ tab }) => samePane ? eligible(tab) : isCenterActionTab(tab))
    .toSorted((a, b) => Math.abs(a.position - index) - Math.abs(b.position - index) || b.position - a.position)[0]?.tab.label;
  return nearest(true) ?? nearest(false);
}

export function hideTab(port: TabSelectionPort, index: number): boolean {
  const tab = port.tabs[index];
  if (!tab || tab.hidden) return false;
  tab.hidden = true;
  port.focusHistory = port.focusHistory.filter((label) => label !== tab.label);
  if (port.activeTab === index) {
    const label = replacement(port, index);
    port.activeTab = port.tabs.findIndex((candidate) => candidate.label === label);
  }
  if (port.secondaryTabLabel === tab.label) port.secondaryTabLabel = replacement(port, index);
  repairSelections(port);
  return true;
}

export function revealTab(port: VisibilityPort, index: number): boolean {
  if (!Number.isSafeInteger(index) || index < 0) return false;
  const tab = port.tabs[index];
  if (!tab || tab.runtime?.closing) return false;
  const pane = focusedPane(port.tabs, port.activeTab);
  delete tab.hidden;
  if (tab.dock) {
    tab.pane = pane === 'right' ? 'right' : undefined;
    port.activeTab = applyDock(port.tabs, port.activeTab, index, null, (next) => port.recordLeavingActiveTab(next), () => port.tabs);
  }
  return true;
}
