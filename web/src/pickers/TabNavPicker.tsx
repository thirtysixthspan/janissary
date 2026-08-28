import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { TabView } from '@shared/protocol';
import { statusDotIcon } from '../icons';
import { filterTabs, displayLabel } from '../tab-nav-match';

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
