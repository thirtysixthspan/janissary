import type { CenterPane, Tab } from './types.js';
import type { AgentState } from '../agent/types.js';
import type { Managers } from '../managers.js';
import { TAB_RENAME_MAX_LENGTH } from '../config.js';
import { messageBus } from '../bus.js';
import { closeTabOp } from './close.js';
import { renameTabOp } from './rename.js';
import { applyDock } from './dock.js';
import { insertTabInGroup } from './index.js';
import { setActiveTabOp, moveTabOp, reorderTabOp, reorderTabToOp } from './navigation-commands.js';
import { centerPane, hasSplit, isCenterActionTab } from './split.js';
import { focusedPane, recentLabel, moveTabToOtherPaneSelection } from './split-selection.js';

export type TabOperationsPort = {
  tabs: Tab[];
  activeTab: number;
  secondaryTabLabel?: string;
  focusHistory: string[];
  managerServices: Managers;
  openFiles: Map<string, string>;
  findIndex(label: string): number;
  recordLeavingActiveTab(newIndex: number): void;
  popFocusHistory(eligible?: (tab: Tab) => boolean): number | undefined;
  repairSelections(): void;
  persist(state: AgentState): void;
  buildAgentState(tab: Tab): AgentState;
  registerFile(path: string): string;
};

export function setActiveTab(port: TabOperationsPort, index: number): void {
  setActiveTabOp(port.tabs, index, (i) => port.recordLeavingActiveTab(i), (i) => {
    const previous = port.tabs[port.activeTab];
    const next = port.tabs[i];
    if (previous && next && hasSplit(port.tabs) && isCenterActionTab(previous) && isCenterActionTab(next)
      && centerPane(previous) !== centerPane(next)) port.secondaryTabLabel = previous.label;
    port.activeTab = i;
    port.repairSelections();
  });
}

export function moveTab(port: TabOperationsPort, dir: -1 | 1): void {
  moveTabOp(port.tabs, port.activeTab, dir, (index) => setActiveTab(port, index));
}

export function setDock(port: TabOperationsPort, index: number, dock: 'left' | 'right' | null): void {
  const tab = port.tabs[index];
  if (!tab) return;
  const sourcePane = centerPane(tab);
  const wasActive = index === port.activeTab;
  const wasSecondary = tab.label === port.secondaryTabLabel;
  const pane = focusedPane(port.tabs, port.activeTab);
  tab.pane = dock === null && pane === 'right' ? 'right' : undefined;
  port.activeTab = applyDock(port.tabs, port.activeTab, index, dock, (i) => port.recordLeavingActiveTab(i));
  if (dock !== null && wasActive && hasSplit(port.tabs)) {
    const replacement = recentLabel(port.tabs, port.focusHistory, (candidate) => isCenterActionTab(candidate) && centerPane(candidate) === sourcePane, tab.label);
    if (replacement) port.activeTab = port.findIndex(replacement);
  }
  if (dock !== null && wasSecondary) port.secondaryTabLabel = undefined;
  if (dock === null) tab.hasUnread = false;
  port.repairSelections();
  messageBus.emit('state', { type: 'dirty' });
}

export function moveTabToOtherPane(port: TabOperationsPort, index: number): void {
  const target = port.tabs[index];
  const active = port.tabs[port.activeTab];
  if (!target || !active) return;
  const result = moveTabToOtherPaneSelection(port.tabs, target.label, active.label, port.secondaryTabLabel, port.focusHistory);
  if (!result) return;
  if (target.label !== active.label) port.recordLeavingActiveTab(index);
  port.tabs = result.tabs;
  port.activeTab = port.findIndex(result.activeLabel);
  port.secondaryTabLabel = result.secondaryLabel;
  port.repairSelections();
  messageBus.emit('state', { type: 'dirty' });
}

export function placeProfileTabs(port: TabOperationsPort, candidates: { label: string; number?: number; pane?: CenterPane }[], focus: (tabs: Tab[], active: number, candidates: { label: string; number?: number; pane?: CenterPane }[], findIndex: (label: string) => number) => { activeTab?: number; secondaryTabLabel?: string }): void {
  const result = focus(port.tabs, port.activeTab, candidates, (label) => port.findIndex(label));
  if (result.activeTab !== undefined) port.activeTab = result.activeTab;
  if (result.secondaryTabLabel !== undefined) port.secondaryTabLabel = result.secondaryTabLabel;
  port.repairSelections();
}

export function reorderTab(port: TabOperationsPort, dir: -1 | 1): void {
  reorderTabOp(port.tabs, port.activeTab, dir, (tabs, activeTab) => { port.tabs = tabs; port.activeTab = activeTab; }, (state) => port.persist(state), (tab) => port.buildAgentState(tab));
}

export function reorderTabTo(port: TabOperationsPort, from: number, to: number): void {
  reorderTabToOp(port.tabs, port.activeTab, from, to, (tabs, activeTab) => { port.tabs = tabs; port.activeTab = activeTab; }, (state) => port.persist(state), (tab) => port.buildAgentState(tab));
}

export function closeTab(port: TabOperationsPort, index: number): void {
  const closing = port.tabs[index];
  if (!closing) return;
  const closingPane = centerPane(closing);
  const wasActive = index === port.activeTab;
  const wasSecondary = closing.label === port.secondaryTabLabel;
  closeTabOp(port.tabs, port.activeTab, index, port.managerServices, port.openFiles, (label) => {
    port.focusHistory = port.focusHistory.filter((entry) => entry !== label);
  }, () => port.popFocusHistory((tab) => isCenterActionTab(tab) && centerPane(tab) === closingPane && tab.label !== closing.label), (tabs, activeTab) => {
    port.tabs = tabs;
    port.activeTab = activeTab;
    if (wasActive && hasSplit(tabs) && centerPane(tabs[activeTab]) !== closingPane) {
      const replacement = recentLabel(tabs, port.focusHistory, (tab) => isCenterActionTab(tab) && centerPane(tab) === closingPane);
      if (replacement) port.activeTab = port.findIndex(replacement);
    }
    if (wasSecondary) port.secondaryTabLabel = undefined;
    port.repairSelections();
  });
}

export function renameTab(port: TabOperationsPort, index: number, title: string): void {
  renameTabOp(port.tabs, index, title, TAB_RENAME_MAX_LENGTH, (path) => port.registerFile(path), (label, path) => port.managerServices.editorWatch.watch(label, path), (state) => port.persist(state), (tab) => port.buildAgentState(tab));
}

export function toggleCollapse(port: TabOperationsPort): void {
  const tab = port.tabs[port.activeTab];
  if (!tab) return;
  tab.toolStepsExpanded = !tab.toolStepsExpanded;
  messageBus.emit('state', { type: 'dirty' });
}

export function insertTab(port: TabOperationsPort, tab: Tab): void {
  if (isCenterActionTab(tab)) tab.pane = focusedPane(port.tabs, port.activeTab) === 'right' ? 'right' : undefined;
  port.tabs = insertTabInGroup(port.tabs, tab);
}
