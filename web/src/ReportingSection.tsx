import React, { useState } from 'react';
import type { TabView } from '@shared/protocol';
import { MonitorTab } from './MonitorTab';

// Reporting tabs are a separate class from action tabs: they report, they never take
// commands. A tab is a reporting tab when its view kind is in this set (currently just
// the monitor window).
export function isReportingTab(tab: TabView): boolean {
  return tab.view === 'monitor';
}

// One reporting tab plus its index in the server's full tab list (close RPCs need it).
export type ReportingEntry = { tab: TabView; index: number };

// The reporting section: a second tab area rendered below the command bar at 1/4 the
// height of the action-tab area. It has its own strip and its own (client-side) selection,
// independent of the server's active action tab. Hidden entirely while no reporting tabs
// exist. Each reporting tab carries the color of the tab it monitors — in its strip dot,
// strip border, and the body's left border.
export function ReportingSection({ entries, onClose, onRun }: {
  entries: ReportingEntry[];
  onClose: (index: number) => void;
  onRun: (id: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  if (entries.length === 0) return null;
  const current = entries[Math.min(selected, entries.length - 1)];

  return (
    <div className="reporting-section">
      <div className="tabstrip reporting-strip">
        {entries.map((entry, index) => (
          <div
            key={entry.tab.label}
            className={`tab${entry === current ? ' active' : ''}`}
            style={{ borderTopColor: entry.tab.groupColor }}
            onClick={() => setSelected(index)}
          >
            <span className="dot" style={{ color: entry.tab.dotColor }}>●</span>
            <span>{entry.tab.title ?? entry.tab.label}</span>
            <button
              type="button"
              className="tab-close"
              title="Close tab"
              aria-label="Close tab"
              onClick={(e) => { e.stopPropagation(); onClose(entry.index); }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {current.tab.view === 'monitor' && current.tab.monitor && (
        <div className="reporting-body" style={{ borderLeft: `4px solid ${current.tab.dotColor}` }}>
          <MonitorTab suggestions={current.tab.monitor.suggestions} onRun={onRun} />
        </div>
      )}
    </div>
  );
}
