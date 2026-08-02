import type { Tab } from './types.js';
import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { closeTabResources } from './cleanup.js';
import { removeTabAt } from './reorder.js';

// Resolves TabManager.closeTab: releases the tab's external resources, then either exits the
// app (closing the last non-docked tab) or removes it from `tabs` and restores focus.
// `applyResult` is called with the new `tabs`/`activeTab` *before* the `state:dirty` emit below —
// mirroring `reorderTabOp`'s documented invariant — so the resulting broadcast (some listeners
// read manager state synchronously off that emit) reflects the tab's removal instead of the
// stale, pre-removal array.
export function closeTabOp(
  tabs: Tab[],
  activeTab: number,
  index: number,
  managers: Managers,
  openFiles: Map<string, string>,
  discardFocusHistoryLabel: (label: string) => void,
  popFocusHistory: () => number | undefined,
  applyResult: (tabs: Tab[], activeTab: number) => void,
): void {
  const tab = tabs[index];
  if (!tab) return;
  const nonDockedCount = tabs.filter((t) => !t.dock).length;
  closeTabResources(tab, managers, openFiles, nonDockedCount);
  // Closing the last remaining non-docked tab quits the app (same as the `quit` command).
  if (!tab.dock && nonDockedCount <= 1) {
    messageBus.emit('app', { type: 'exit' });
    return;
  }
  const wasActive = index === activeTab;
  discardFocusHistoryLabel(tab.label);
  const nextTabs = removeTabAt(tabs, index);
  const restored = wasActive ? popFocusHistory() : undefined;
  const nextActiveTab = restored ?? Math.min(activeTab, nextTabs.length - 1);
  applyResult(nextTabs, nextActiveTab);
  const active = nextTabs[nextActiveTab];
  if (active) active.hasUnread = false;
  messageBus.emit('state', { type: 'dirty' });
}
