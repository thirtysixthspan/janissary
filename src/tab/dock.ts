import { isPluginTab } from './view-guards.js';
import { beginDwell } from './dwell.js';
import type { Tab } from './types.js';

// Resolves docking a tab into a sidebar (`'left'` | `'right'`), or undocking it back to the
// center strip (`null`, which also makes it the active tab). Docking into a side that already
// holds a tab of the *same view kind* displaces that occupant back to center (non-destructive —
// nothing closes); a different-kind occupant (the file navigator and notifications tab share a
// sidebar via the client's own tab-switcher) is left docked. Two plugin tabs count as the same kind
// only when the same plugin owns both: `view` is `'plugin'` for every one of them, so comparing view
// alone would let one plugin's docked tab displace an unrelated plugin's. Mutates `tab.dock` in place
// (matching the rest of TabManager's per-tab field mutation) and returns the active tab index the
// caller should adopt. `recordLeavingActiveTab` is invoked exactly where the caller's focus-history
// bookkeeping expects it — right before the active tab actually changes.
//
// Undocking back to the center strip makes the tab the active one, so it starts that tab's unread
// dwell rather than dropping its badge; see `./dwell.ts`. Docking *into* a sidebar deliberately
// leaves the badge alone: a docked tab is permanently visible chrome, but it may have been badged
// before it was docked, and the dwell for a tab that was never selected will never come.
export function applyDock(
  tabs: Tab[],
  activeTab: number,
  index: number,
  dock: 'left' | 'right' | null,
  recordLeavingActiveTab: (newIndex: number) => void,
  resolveTabs?: () => Tab[],
): number {
  const tab = tabs[index];
  if (!tab) return activeTab;
  if (dock === null) {
    tab.dock = undefined;
    recordLeavingActiveTab(index);
    beginDwell(resolveTabs ?? (() => tabs), tab.label);
    return index;
  }
  const occupant = tabs.find((t, i) => i !== index && t.dock === dock && sameDockKind(t, tab));
  if (occupant) occupant.dock = undefined;
  tab.dock = dock;
  return activeTab === index ? nearestNonDocked(tabs, activeTab, recordLeavingActiveTab) : activeTab;
}

function sameDockKind(candidate: Tab, tab: Tab): boolean {
  if (candidate.view !== tab.view) return false;
  if (tab.view !== 'plugin') return true;
  return isPluginTab(candidate) && isPluginTab(tab) && candidate.plugin.id === tab.plugin.id;
}

function nearestNonDocked(tabs: Tab[], activeTab: number, recordLeavingActiveTab: (newIndex: number) => void): number {
  const total = tabs.length;
  for (let step = 0; step < total; step++) {
    const index = (activeTab + step) % total;
    if (!tabs[index]?.dock) { recordLeavingActiveTab(index); return index; }
  }
  return activeTab;
}
