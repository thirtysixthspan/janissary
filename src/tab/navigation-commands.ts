import type { Tab } from './types.js';
import type { AgentState } from '../agent/types.js';
import { messageBus } from '../bus.js';
import { computeReorder, computeReorderTo } from './reorder.js';
import { isCenterActionTab } from './placement.js';
import { beginDwell } from './dwell.js';

// Active-tab navigation coordination extracted from TabManager: wraps the pure tab-array
// computations in reorder.ts with the focus-history bookkeeping, persistence, and messageBus
// emits that make them visible to the rest of the app. Callback ordering mirrors the original
// inline implementations exactly, since some listeners read manager state synchronously off
// the 'dirty' emit.
//
// Each of the three operations here leaves the user looking at a different tab, so each of them
// starts that tab's unread dwell rather than clearing its badge outright — see `./dwell.ts` for why a
// glance must not count as having read it. `resolveTabs` is handed over rather than the array
// itself, because a reorder or a close replaces `tabs` wholesale and the dwell fires later.

export function setActiveTabOp(
  tabs: Tab[], index: number,
  recordLeavingActiveTab: (newIndex: number) => void,
  applyActiveTab: (index: number) => number,
  resolveTabs?: () => Tab[],
): void {
  if (index < 0 || index >= tabs.length) return;
  if (tabs[index]?.dock) return; // a docked tab is never the active tab
  recordLeavingActiveTab(index);
  const tab = tabs[applyActiveTab(index)];
  if (tab) beginDwell(resolveTabs ?? (() => tabs), tab.label);
  messageBus.emit('state', { type: 'dirty' });
}

export function moveTabOp(
  tabs: Tab[], activeTab: number, dir: -1 | 1, setActiveTab: (index: number) => void,
): void {
  const total = tabs.length;
  for (let step = 1; step <= total; step++) {
    const index = (activeTab + dir * step + total) % total;
    const tab = tabs[index];
    if (tab && isCenterActionTab(tab)) { setActiveTab(index); return; }
  }
}

export function reorderTabOp(
  tabs: Tab[], from: number, dir: -1 | 1,
  applyResult: (tabs: Tab[], activeTab: number) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
  resolveTabs?: () => Tab[],
): void {
  const result = computeReorder(tabs, from, dir);
  if (!result) return;
  applyResult(result.tabs, result.activeTab);
  const active = result.tabs[result.activeTab];
  if (active) beginDwell(resolveTabs ?? (() => result.tabs), active.label);
  persist(buildAgentState(result.tabs[from]));
  persist(buildAgentState(result.tabs[result.activeTab]));
  messageBus.emit('state', { type: 'dirty' });
}

export function reorderTabToOp(
  tabs: Tab[], activeTab: number, from: number, to: number,
  applyResult: (tabs: Tab[], activeTab: number) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
  resolveTabs?: () => Tab[],
): void {
  const result = computeReorderTo(tabs, from, to);
  if (!result) return;
  const moved = result.tabs[result.activeTab];
  const currentLabel = tabs[activeTab]?.label;
  const nextActive = moved.dock || moved.group === 0
    ? result.tabs.findIndex((tab) => tab.label === currentLabel)
    : result.activeTab;
  applyResult(result.tabs, nextActive);
  const active = result.tabs[nextActive];
  if (active) beginDwell(resolveTabs ?? (() => result.tabs), active.label);
  const first = Math.min(from, to);
  const last = Math.max(from, to);
  const affectedTabs = result.tabs.slice(first, last + 1);
  for (const tab of affectedTabs) persist(buildAgentState(tab));
  messageBus.emit('state', { type: 'dirty' });
}
