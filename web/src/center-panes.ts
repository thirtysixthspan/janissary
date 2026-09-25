import type { TabView } from '@shared/protocol';
import { centerPane } from '@shared/tab/placement';
import type { TabEntry } from './tab-entries';

// The rules that decide which tab shows in which pane of the split centre strip, as plain
// functions a test can call without rendering the area. Which pane a single tab occupies is the
// server's rule, shared through `@shared/tab/placement`.

export function entriesInPane(entries: TabEntry[], pane: 'left' | 'right'): TabEntry[] {
  return entries.filter((entry) => centerPane(entry.tab) === pane);
}

export function selectedIndexForPane(
  tabs: TabView[],
  activeTab: number,
  secondaryTab: number | undefined,
  pane: 'left' | 'right',
): number | undefined {
  const focused = tabs[activeTab];
  return focused && centerPane(focused) === pane ? activeTab : secondaryTab;
}

// The entry a pane shows: the one matching the pane's selected index, or the first visible entry
// when that index is not in this pane.
export function currentEntryForPane(
  visibleEntries: TabEntry[],
  selected: number | undefined,
): TabEntry | undefined {
  return visibleEntries.find((entry) => entry.index === selected) ?? visibleEntries[0];
}
