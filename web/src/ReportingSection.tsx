import React, { useCallback, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { TabView } from '@shared/protocol';
import { MonitorTab } from './MonitorTab';
import { statusDotIcon } from './icons';
import { startDrag } from './drag-resize';

// Reporting tabs are a separate class from action tabs: they report, they never take
// commands. A tab is a reporting tab when its view kind is in this set (currently just
// the monitor window).
export function isReportingTab(tab: TabView): boolean {
  return tab.view === 'monitor';
}

// One reporting tab plus its index in the server's full tab list (close RPCs need it).
export type ReportingEntry = { tab: TabView; index: number };

// Neither the reporting section nor the action area may shrink below 15% of the
// viewport height; the divider drag clamps to this band.
const MIN_PCT = 15;
const MAX_PCT = 100 - MIN_PCT;
export const DEFAULT_PCT = 20;

// The reporting section: a second tab area rendered below the command bar. It has its
// own strip and its own (client-side) selection, independent of the server's active
// action tab. Hidden entirely while no reporting tabs exist. Each reporting tab carries
// the color of the tab it monitors — in its strip dot, strip border, and the body's
// left border. The top edge is a draggable divider: pulling it up grows the reporting
// body while the action area shrinks (and vice versa), within the 15% floors. Height is a
// controlled prop, owned by `App` (so a profile's `_layout.json` can drive it too — see
// `useLayoutState`).
export function ReportingSection({
  entries, onClose, onRun, onRate, onReset, onSnapshot, heightPct = DEFAULT_PCT, onHeightPctChange,
}: {
  entries: ReportingEntry[];
  onClose: (index: number) => void;
  onRun: (id: string) => void;
  onRate: (id: string, up: boolean) => void;
  onReset: (name: string) => void;
  onSnapshot: (name: string) => void;
  heightPct?: number;
  onHeightPctChange?: (heightPct: number) => void;
}) {
  const [selected, setSelected] = useState(0);

  const onDividerDown = useCallback((down: React.MouseEvent) => {
    down.preventDefault();
    startDrag((move) => {
      const pct = ((globalThis.innerHeight - move.clientY) / globalThis.innerHeight) * 100;
      onHeightPctChange?.(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
    });
  }, [onHeightPctChange]);

  if (entries.length === 0) return null;
  const current = entries[Math.min(selected, entries.length - 1)];

  return (
    <div className="reporting-section" style={{ flex: `0 0 ${heightPct}%` }}>
      <div className="reporting-resize" onMouseDown={onDividerDown} />
      <div className="tabstrip reporting-strip">
        {entries.map((entry, index) => (
          <div
            key={entry.tab.label}
            className={`tab${entry === current ? ' active' : ''}`}
            style={{ borderTopColor: entry.tab.groupColor }}
            onClick={() => setSelected(index)}
          >
            <span className="dot" style={{ color: entry.tab.dotColor }}><FontAwesomeIcon icon={statusDotIcon} /></span>
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
        <div className="reporting-body" data-doc-shot="reporting-tab" tabIndex={0} style={{ borderLeft: `4px solid ${current.tab.dotColor}` }}>
          <MonitorTab
            persona={current.tab.monitor.persona}
            targets={current.tab.monitor.targets}
            contextBytes={current.tab.monitor.contextBytes}
            suggestions={current.tab.monitor.suggestions}
            onRun={onRun}
            onRate={onRate}
            onReset={() => onReset(current.tab.label)}
            onSnapshot={() => onSnapshot(current.tab.label)}
          />
        </div>
      )}
    </div>
  );
}
