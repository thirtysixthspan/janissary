import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { closeTabResources } from './cleanup.js';
import { removeTabAt } from './reorder.js';

// Resolves TabManager.closeTab: releases the tab's external resources, then either exits the
// app (closing the last non-docked tab) or removes it from `tabs` and restores focus. Returns
// `undefined` when the app is exiting (nothing left for the caller to assign).
export function closeTabOp(
  tabs: Tab[],
  activeTab: number,
  index: number,
  managers: Managers,
  openFiles: Map<string, string>,
  context: Map<string, string[]>,
  queue: Map<string, string[]>,
  discardFocusHistoryLabel: (label: string) => void,
  popFocusHistory: () => number | undefined,
): { tabs: Tab[]; activeTab: number } | undefined {
  const tab = tabs[index];
  if (!tab) return undefined;
  const nonDockedCount = tabs.filter((t) => !t.dock).length;
  closeTabResources(tab, managers, openFiles, context, queue, nonDockedCount);
  // Closing the last remaining non-docked tab quits the app (same as the `quit` command).
  if (!tab.dock && nonDockedCount <= 1) {
    messageBus.emit('app', { type: 'exit' });
    return undefined;
  }
  const wasActive = index === activeTab;
  discardFocusHistoryLabel(tab.label);
  const nextTabs = removeTabAt(tabs, index);
  const restored = wasActive ? popFocusHistory() : undefined;
  const nextActiveTab = restored ?? Math.min(activeTab, nextTabs.length - 1);
  const active = nextTabs[nextActiveTab];
  if (active) active.hasUnread = false;
  messageBus.emit('state', { type: 'dirty' });
  return { tabs: nextTabs, activeTab: nextActiveTab };
}
