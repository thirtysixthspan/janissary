// Tracks which tab was active before the current one, so closing or undocking a tab can restore
// focus to its predecessor rather than just clamping to the nearest surviving index. Pure
// operations on the `tabs`/`focusHistory` state; TabManager owns the state itself.

import type { Tab } from '../types.js';

// Records that `activeTab` is about to stop being active in favor of `newIndex`, so closing
// `newIndex` later can restore focus to it. No-ops (returns `focusHistory` unchanged) if
// `newIndex` is already active.
export function recordLeavingActiveTab(tabs: Tab[], activeTab: number, focusHistory: string[], newIndex: number): string[] {
  if (newIndex === activeTab) return focusHistory;
  const leaving = tabs[activeTab]?.label;
  if (!leaving) return focusHistory;
  return [...focusHistory.filter((l) => l !== leaving), leaving];
}

// Pops the most recent still-valid (existing, non-docked) label off the focus-history stack,
// discarding any stale entries (closed or since-docked tabs) along the way. Returns the resolved
// tab index (or `undefined` if none remain) and the history with all consumed entries removed.
export function popFocusHistory(tabs: Tab[], focusHistory: string[]): { index: number | undefined; history: string[] } {
  const history = [...focusHistory];
  while (history.length > 0) {
    const label = history.pop();
    const index = tabs.findIndex((t) => t.label === label);
    if (index !== -1 && !tabs[index].dock) return { index, history };
  }
  return { index: undefined, history };
}

// The label of the file-tree tab to retarget when the metadata-row 📁 button is clicked: the
// most-recently-left still-open `view === 'files'` tab. Scans `focusHistory` from most-recent to
// least-recent without mutating it and — unlike `popFocusHistory` — includes docked tabs, since a
// docked file navigator is a valid retarget target. Falls back to the first `view === 'files'`
// tab in `tabs` order (e.g. a tree that never lost focus since opening); returns `undefined` when
// no file-tree tab exists.
export function mostRecentFileTreeLabel(tabs: Tab[], focusHistory: string[]): string | undefined {
  for (let i = focusHistory.length - 1; i >= 0; i--) {
    const tab = tabs.find((t) => t.label === focusHistory[i]);
    if (tab?.view === 'files') return tab.label;
  }
  return tabs.find((t) => t.view === 'files')?.label;
}
