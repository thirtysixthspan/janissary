import type { Tab } from '../types.js';
import { renumberTabs } from './utils.js';
import { centerPane, isCenterActionTab } from './split.js';

// Resolves TabManager.reorderTab: swaps the active tab with its left/right neighbor (skipping
// docked tabs, per swapTabsLeft/swapTabsRight) and moves `activeTab` along with it. Returns
// undefined when the swap is a no-op (already at an edge).
export function computeReorder(tabs: Tab[], activeTab: number, dir: -1 | 1): { tabs: Tab[]; activeTab: number } | undefined {
  const moved = tabs[activeTab];
  if (!moved || !isCenterActionTab(moved)) return undefined;
  let to = activeTab + dir;
  while (to >= 0 && to < tabs.length) {
    const candidate = tabs[to];
    if (isCenterActionTab(candidate) && centerPane(candidate) === centerPane(moved)) break;
    to += dir;
  }
  if (to < 0 || to >= tabs.length || tabs[to].group !== moved.group) return undefined;
  const next = [...tabs];
  const neighbor = next[to];
  next[to] = next[activeTab];
  next[activeTab] = neighbor;
  return { tabs: renumberTabs(next), activeTab: to };
}

export function computeReorderTo(
  tabs: Tab[], from: number, to: number,
): { tabs: Tab[]; activeTab: number } | undefined {
  if (from < 0 || to < 0 || from >= tabs.length || to >= tabs.length || from === to) return undefined;
  const moved = tabs[from];
  if (
    isCenterActionTab(moved)
    && isCenterActionTab(tabs[to])
    && centerPane(moved) !== centerPane(tabs[to])
  ) return undefined;
  if (!moved.dock && moved.group !== 0 && tabs[to].group !== moved.group) return undefined;
  const remaining = removeTabAt(tabs, from);
  remaining.splice(to, 0, moved);
  return { tabs: renumberTabs(remaining), activeTab: to };
}

// Removes the tab at `index`, renumbering the survivors (TabManager.closeTab).
export function removeTabAt(tabs: Tab[], index: number): Tab[] {
  return tabs.filter((_, i) => i !== index).map((t, i) => ({ ...t, number: i + 1 }));
}
