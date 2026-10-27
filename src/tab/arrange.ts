import type { CenterPane, Tab } from './types.js';
import type { TabOperationsPort } from './operations.js';
import { messageBus } from '../bus.js';
import { resolveTabGroup } from './groups.js';
import { isDockableTab } from './dock.js';
import { isCenterActionTab, isReportingTab, isSplitEligibleTab, centerPane } from './placement.js';
import { moveTabToOtherPaneSelection, focusedPane, recentLabel } from './split-selection.js';
import { hasSplit } from './split.js';
import { removeTabAt } from './reorder.js';
import { insertTabInGroup, renumberTabs } from './utils.js';
import { setDock } from './operations.js';

export type TabArrangement =
  | { kind: 'move'; position: number }
  | { kind: 'pane'; side: CenterPane }
  | { kind: 'split' }
  | { kind: 'color'; color: string }
  | { kind: 'group'; selector: string }
  | { kind: 'dock'; side: 'left' | 'right' }
  | { kind: 'undock' };

export function arrangeTab(port: TabOperationsPort, label: string, change: TabArrangement): boolean {
  const index = port.findIndex(label);
  const tab = port.tabs[index];
  if (!tab) return false;
  switch (change.kind) {
    case 'move': { return moveTab(port, tab, change.position); }
    case 'pane': { return movePane(port, tab, change.side); }
    case 'split': { return movePane(port, tab); }
    case 'color': { return setColor(port, tab, change.color); }
    case 'group': { return moveGroup(port, tab, change.selector); }
    case 'dock': { return dockTab(port, tab, index, change.side); }
    case 'undock': { return undockTab(port, tab); }
  }
}

function moveTab(port: TabOperationsPort, tab: Tab, position: number): boolean {
  const mates = port.tabs.filter((candidate) => {
    if (candidate.label === tab.label) return true;
    if (tab.hidden) return isCenterActionTab(candidate) && candidate.group === tab.group && centerPane(candidate) === centerPane(tab);
    if (tab.dock) return candidate.dock === tab.dock;
    if (isReportingTab(tab)) return isReportingTab(candidate);
    return isCenterActionTab(candidate) && candidate.group === tab.group && centerPane(candidate) === centerPane(tab);
  });
  const destination = mates[Math.min(position, mates.length) - 1];
  if (!destination || destination.label === tab.label) return true;
  const activeLabel = port.tabs[port.activeTab]?.label;
  const index = port.findIndex(tab.label);
  const destinationIndex = port.findIndex(destination.label);
  const remaining = removeTabAt(port.tabs, index);
  remaining.splice(destinationIndex, 0, tab);
  port.tabs = renumberTabs(remaining);
  repairAfterReorder(port, activeLabel);
  return true;
}

function setColor(port: TabOperationsPort, tab: Tab, color: string): boolean {
  if (tab.dotColor === color) return true;
  tab.dotColor = color;
  messageBus.emit('state', { type: 'dirty' });
  return true;
}

function moveGroup(port: TabOperationsPort, tab: Tab, selector: string): boolean {
  if (isReportingTab(tab)) return false;
  const group = resolveTabGroup(port.tabs, selector, tab, tab.dotColor);
  if (group.id === tab.group) return true;
  const activeLabel = port.tabs[port.activeTab]?.label;
  const remaining = removeTabAt(port.tabs, port.findIndex(tab.label));
  tab.group = group.id;
  tab.groupName = group.name;
  tab.groupColor = group.color;
  port.tabs = insertTabInGroup(remaining, tab);
  repairAfterReorder(port, activeLabel);
  return true;
}

function movePane(port: TabOperationsPort, tab: Tab, side?: CenterPane): boolean {
  if (!isSplitEligibleTab(tab)) return false;
  const active = port.tabs[port.activeTab];
  if (!active) return false;
  const sourcePane = centerPane(tab);
  const targetPane = side ?? (sourcePane === 'left' ? 'right' : 'left');
  if (sourcePane === targetPane) return true;
  const activeLabel = active.label;
  const activePane = centerPane(active);
  const result = moveTabToOtherPaneSelection(
    port.tabs, tab.label, activeLabel, port.secondaryTabLabel, port.focusHistory,
  );
  if (!result) return false;
  if (result.tabs.every((candidate) => candidate.label !== tab.label)) return false;
  const splitRemains = hasSplit(result.tabs);
  let secondaryLabel: string | undefined;
  let nextActiveLabel = activeLabel;
  if (tab.label === activeLabel) {
    nextActiveLabel = tab.label;
    secondaryLabel = result.secondaryLabel;
  } else if (sourcePane === activePane) {
    secondaryLabel = splitRemains ? tab.label : undefined;
  } else if (splitRemains) {
    secondaryLabel = visibleInPane(result.tabs, port.secondaryTabLabel, sourcePane, tab.label)
      ?? recentLabel(result.tabs, port.focusHistory, (candidate) => (
        isCenterActionTab(candidate) && centerPane(candidate) === sourcePane
      ), tab.label);
  }
  port.tabs = result.tabs;
  port.activeTab = port.findIndex(nextActiveLabel);
  port.secondaryTabLabel = secondaryLabel;
  port.repairSelections();
  messageBus.emit('state', { type: 'dirty' });
  return true;
}

function visibleInPane(tabs: Tab[], label: string | undefined, pane: CenterPane, excluded: string): string | undefined {
  const tab = tabs.find((candidate) => candidate.label === label);
  return tab && tab.label !== excluded && isCenterActionTab(tab) && centerPane(tab) === pane ? tab.label : undefined;
}

function dockTab(port: TabOperationsPort, tab: Tab, index: number, side: 'left' | 'right'): boolean {
  if (!isDockableTab(tab)) return false;
  if (isCenterActionTab(tab) && port.tabs.filter(isCenterActionTab).length <= 1) return false;
  if (tab.dock === side) return true;
  setDock(port, index, side);
  return true;
}

function undockTab(port: TabOperationsPort, tab: Tab): boolean {
  if (tab.hidden) return false;
  if (!tab.dock) return true;
  tab.dock = undefined;
  tab.pane = focusedPane(port.tabs, port.activeTab) === 'right' ? 'right' : undefined;
  port.repairSelections();
  messageBus.emit('state', { type: 'dirty' });
  return true;
}

function repairAfterReorder(port: TabOperationsPort, activeLabel: string | undefined): void {
  port.activeTab = activeLabel === undefined ? -1 : port.findIndex(activeLabel);
  port.repairSelections();
  messageBus.emit('state', { type: 'dirty' });
}
