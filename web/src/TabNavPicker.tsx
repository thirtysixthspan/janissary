import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { TabView } from '@shared/protocol';
import { statusDotIcon } from './icons';

export type TabNavEntry = { tab: TabView; index: number };

// The alias (see `rename`) when set, otherwise the internal label — mirrors TabItem's tab-strip
// display so a renamed tab shows and matches the same way in both places.
function displayLabel(tab: TabView): string {
  return tab.title ?? tab.label;
}

// Substring match on label/alias (case-insensitive) plus exact/prefix match on the tab number,
// with number matches sorted first (typing "3" jumps straight to tab 3) then alphabetically by
// display label.
export function filterTabs(tabs: TabView[], query: string): TabNavEntry[] {
  const entries = tabs.map((tab, index) => ({ tab, index }));
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

function highlightLabel(label: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return label;
  const start = label.toLowerCase().indexOf(q.toLowerCase());
  if (start === -1) return label;
  const end = start + q.length;
  return (
    <>
      {label.slice(0, start)}
      <mark>{label.slice(start, end)}</mark>
      {label.slice(end)}
    </>
  );
}

// The Ctrl+G / `nav` overlay listing every open tab, fuzzy-filtered by label or number. Up/Down
// (and Ctrl+P/N) move the selection, Return jumps to the selected tab, Escape closes — handled by
// App's key handler; a row can also be clicked.
type Properties = { tabs: TabView[]; query: string; selected: number; onPick: (index: number) => void };

export function TabNavPicker({ tabs, query, selected, onPick }: Properties) {
  const entries = filterTabs(tabs, query);
  return (
    <div className="picker tab-nav-picker" data-doc-shot="tab-nav-overlay">
      <div className="picker-title">nav{query ? `: ${query}` : ''}</div>
      {entries.length === 0 ? (
        <div className="picker-row picker-empty">(no matching tabs)</div>
      ) : (
        entries.map(({ tab, index }, row) => (
          <div
            key={index}
            className={`picker-row${row === selected ? ' selected' : ''}`}
            onClick={() => onPick(index)}
          >
            <span className="dot" style={{ color: tab.dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span> {tab.number} {highlightLabel(displayLabel(tab), query)}
          </div>
        ))
      )}
    </div>
  );
}
