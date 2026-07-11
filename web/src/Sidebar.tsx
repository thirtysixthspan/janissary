import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';
import { NotificationsTab } from './NotificationsTab';
import { startDrag } from './drag-resize';

const MIN_WIDTH_PX = 180;
const MAX_WIDTH_PCT = 50;
const DEFAULT_WIDTH_PX = 280;

// A sidebar (left or right) can dock the file navigator and the notifications tab at the same
// time — the only two dockable kinds — sharing the space via a small internal tab-switcher (only
// shown once both are present). Visibility is derived: the sidebar renders exactly when some tab
// is docked to its side. Width is pure client-side view chrome (local `useState`, unpersisted),
// resized by dragging the divider on the sidebar's inner edge, mirroring ReportingSection's
// height-drag precedent.
export function Sidebar({ side, tabs, client }: { side: 'left' | 'right'; tabs: TabView[]; client: JanusClient }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH_PX);
  const [selectedView, setSelectedView] = useState<'files' | 'notifications'>('files');
  const previousLabelsRef = useRef<Set<string>>(new Set());

  const onDividerDown = useCallback((down: React.MouseEvent) => {
    down.preventDefault();
    const startX = down.clientX;
    const startWidth = width;
    startDrag((move) => {
      const delta = side === 'left' ? move.clientX - startX : startX - move.clientX;
      const maxWidth = globalThis.innerWidth * (MAX_WIDTH_PCT / 100);
      setWidth(Math.min(maxWidth, Math.max(MIN_WIDTH_PX, startWidth + delta)));
    });
  }, [side, width]);

  const entries = tabs.map((tab, index) => ({ tab, index })).filter((e) => e.tab.dock === side);

  // Bring a newly-docked tab into view within the sidebar, mirroring the app's rule that docking
  // always makes the docked tab fully visible.
  useEffect(() => {
    const newlyDocked = entries.find((e) => !previousLabelsRef.current.has(e.tab.label));
    if (newlyDocked) setSelectedView(newlyDocked.tab.view as 'files' | 'notifications');
    previousLabelsRef.current = new Set(entries.map((e) => e.tab.label));
  }, [entries]);

  if (entries.length === 0) return null;
  const current = entries.find((e) => e.tab.view === selectedView) ?? entries[0];

  const divider = <div className="sidebar-resize" onMouseDown={onDividerDown} />;

  return (
    <div className={`sidebar sidebar-${side}`} style={{ flex: `0 0 ${width}px` }} data-doc-shot={`sidebar-${side}`}>
      {side === 'right' && divider}
      <div className="sidebar-body">
        {entries.length > 1 && (
          <div className="sidebar-tabs">
            {entries.map((e) => (
              <button
                key={e.tab.view}
                type="button"
                className={`sidebar-tab-switch${e === current ? ' active' : ''}`}
                onClick={() => setSelectedView(e.tab.view as 'files' | 'notifications')}
              >
                {e.tab.title ?? e.tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="sidebar-strip">
          <span className="sidebar-tab-label">{current.tab.title ?? current.tab.label}</span>
          <button
            type="button"
            className="sidebar-tab-close"
            title="Close"
            aria-label="Close tab"
            onClick={() => client.send({ method: 'closeTab', params: { index: current.index } })}
          >
            ×
          </button>
        </div>
        {current.tab.view === 'files' && current.tab.files && (
          <FileTreeTab files={current.tab.files} client={client} index={current.index} dock={current.tab.dock} autoFocus={false} />
        )}
        {current.tab.view === 'notifications' && (
          <NotificationsTab lines={current.tab.bufferLines} client={client} index={current.index} dock={current.tab.dock} />
        )}
      </div>
      {side === 'left' && divider}
    </div>
  );
}
