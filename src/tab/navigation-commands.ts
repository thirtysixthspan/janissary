import type { Tab, AgentState } from '../types.js';
import { messageBus } from '../bus.js';
import { computeReorder } from './reorder.js';

// Active-tab navigation coordination extracted from TabManager: wraps the pure tab-array
// computations in reorder.ts with the focus-history bookkeeping, persistence, and messageBus
// emits that make them visible to the rest of the app. Callback ordering mirrors the original
// inline implementations exactly, since some listeners read manager state synchronously off
// the 'dirty' emit.

export function setActiveTabOp(
  tabs: Tab[], index: number,
  recordLeavingActiveTab: (newIndex: number) => void,
  applyActiveTab: (index: number) => void,
): void {
  if (index < 0 || index >= tabs.length) return;
  if (tabs[index]?.dock) return; // a docked tab is never the active tab
  recordLeavingActiveTab(index);
  applyActiveTab(index);
  const tab = tabs[index];
  if (tab) tab.hasUnread = false;
  messageBus.emit('state', { type: 'dirty' });
}

export function moveTabOp(
  tabs: Tab[], activeTab: number, dir: -1 | 1, setActiveTab: (index: number) => void,
): void {
  const total = tabs.length;
  for (let step = 1; step <= total; step++) {
    const index = (activeTab + dir * step + total) % total;
    if (!tabs[index]?.dock) { setActiveTab(index); return; }
  }
}

export function reorderTabOp(
  tabs: Tab[], from: number, dir: -1 | 1,
  applyResult: (tabs: Tab[], activeTab: number) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
): void {
  const result = computeReorder(tabs, from, dir);
  if (!result) return;
  applyResult(result.tabs, result.activeTab);
  const active = result.tabs[result.activeTab];
  if (active) active.hasUnread = false;
  persist(buildAgentState(result.tabs[from]));
  persist(buildAgentState(result.tabs[result.activeTab]));
  messageBus.emit('state', { type: 'dirty' });
}
