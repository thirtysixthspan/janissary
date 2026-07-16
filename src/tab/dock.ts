import type { Tab } from '../types.js';

// Resolves docking a tab into a sidebar (`'left'` | `'right'`), or undocking it back to the
// center strip (`null`, which also makes it the active tab). Docking into a side that already
// holds a tab of the *same view kind* displaces that occupant back to center (non-destructive —
// nothing closes); a different-kind occupant (the file navigator and notifications tab share a
// sidebar via the client's own tab-switcher) is left docked. Mutates `tab.dock`/`tab.hasUnread`
// in place (matching the rest of TabManager's per-tab field mutation) and returns the active tab
// index the caller should adopt. `recordLeavingActiveTab` is invoked exactly where the caller's
// focus-history bookkeeping expects it — right before the active tab actually changes.
export function applyDock(
  tabs: Tab[],
  activeTab: number,
  index: number,
  dock: 'left' | 'right' | null,
  recordLeavingActiveTab: (newIndex: number) => void,
): number {
  const tab = tabs[index];
  if (!tab) return activeTab;
  if (dock === null) {
    tab.dock = undefined;
    recordLeavingActiveTab(index);
    tab.hasUnread = false;
    return index;
  }
  const occupant = tabs.find((t, i) => i !== index && t.dock === dock && t.view === tab.view);
  if (occupant) occupant.dock = undefined;
  tab.dock = dock;
  return activeTab === index ? nearestNonDocked(tabs, activeTab, recordLeavingActiveTab) : activeTab;
}

function nearestNonDocked(tabs: Tab[], activeTab: number, recordLeavingActiveTab: (newIndex: number) => void): number {
  const total = tabs.length;
  for (let step = 0; step < total; step++) {
    const index = (activeTab + step) % total;
    if (!tabs[index]?.dock) { recordLeavingActiveTab(index); return index; }
  }
  return activeTab;
}
