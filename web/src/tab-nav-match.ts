import type { TabView } from '@shared/protocol';
import { isReportingTab, type TabEntry } from './tab-entries';

export type TabNavEntry = TabEntry;

// The alias (see `rename`) when set, otherwise the internal label — mirrors TabItem's tab-strip
// display so a renamed tab shows and matches the same way in both places.
export function displayLabel(tab: TabView): string {
  return tab.title ?? tab.label;
}

// Substring match on label/alias (case-insensitive) plus exact/prefix match on the tab number,
// with number matches sorted first (typing "3" jumps straight to tab 3) then alphabetically by
// display label.
export function filterTabs(tabs: TabView[], query: string): TabNavEntry[] {
  const entries = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => !tab.dock && !isReportingTab(tab));
  const q = query.trim().toLowerCase();
  if (!q) return entries;

  const matches = entries.filter(
    ({ tab }) =>
      tab.label.toLowerCase().includes(q) ||
      (tab.title?.toLowerCase().includes(q) ?? false) ||
      String(tab.number).startsWith(q),
  );
  const isNumberMatch = ({ tab }: TabNavEntry) => String(tab.number).startsWith(q);
  const numberMatches = matches.filter((entry) => isNumberMatch(entry));
  const labelMatches = matches.filter((entry) => !isNumberMatch(entry));
  const byLabel = (a: TabNavEntry, b: TabNavEntry) => displayLabel(a.tab).localeCompare(displayLabel(b.tab));
  numberMatches.sort(byLabel);
  labelMatches.sort(byLabel);
  return [...numberMatches, ...labelMatches];
}
