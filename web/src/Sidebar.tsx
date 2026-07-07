import React, { useCallback, useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';

const MIN_WIDTH_PX = 180;
const MAX_WIDTH_PCT = 50;
const DEFAULT_WIDTH_PX = 280;

// A sidebar (left or right) docks at most one tab at a time — today only the file navigator can
// dock. Visibility is derived: the sidebar renders exactly when some tab is docked to its side.
// Width is pure client-side view chrome (local `useState`, unpersisted), resized by dragging the
// divider on the sidebar's inner edge, mirroring ReportingSection's height-drag precedent.
export function Sidebar({ side, tabs, client }: { side: 'left' | 'right'; tabs: TabView[]; client: JanusClient }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH_PX);

  const onDividerDown = useCallback((down: React.MouseEvent) => {
    down.preventDefault();
    const startX = down.clientX;
    const startWidth = width;
    const onMove = (move: MouseEvent) => {
      const delta = side === 'left' ? move.clientX - startX : startX - move.clientX;
      const maxWidth = globalThis.innerWidth * (MAX_WIDTH_PCT / 100);
      setWidth(Math.min(maxWidth, Math.max(MIN_WIDTH_PX, startWidth + delta)));
    };
    const onUp = () => {
      globalThis.removeEventListener('mousemove', onMove);
      globalThis.removeEventListener('mouseup', onUp);
    };
    globalThis.addEventListener('mousemove', onMove);
    globalThis.addEventListener('mouseup', onUp);
  }, [side, width]);

  const entry = tabs.map((tab, index) => ({ tab, index })).find((e) => e.tab.dock === side);
  if (!entry) return null;

  const divider = <div className="sidebar-resize" onMouseDown={onDividerDown} />;

  return (
    <div className={`sidebar sidebar-${side}`} style={{ flex: `0 0 ${width}px` }} data-doc-shot={`sidebar-${side}`}>
      {side === 'right' && divider}
      <div className="sidebar-body" style={{ borderLeft: `4px solid ${entry.tab.dotColor}` }}>
        {entry.tab.view === 'files' && entry.tab.files && (
          <FileTreeTab files={entry.tab.files} client={client} index={entry.index} dock={entry.tab.dock} autoFocus={false} />
        )}
      </div>
      {side === 'left' && divider}
    </div>
  );
}
