import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';
import { NotificationsTab } from './NotificationsTab';
import { SchedulesTab } from './SchedulesTab';
import { TabStrip } from './TabStrip';
import { startDrag } from './drag-resize';
import type { CommandInputDropHandle } from './CommandInput';

const MIN_WIDTH_PX = 180;
const MAX_WIDTH_PCT = 50;
export const DEFAULT_WIDTH_PX = 300;

// A sidebar (left or right) can dock the file navigator and the notifications tab at the same
// time — the only two dockable kinds — sharing the space via a small internal tab-switcher (only
// shown once both are present). Visibility is derived: the sidebar renders exactly when some tab
// is docked to its side. Width is a controlled prop, owned by `App` (so a profile's `_layout.json`
// can drive it too — see `useLayoutState`), resized by dragging the divider on the sidebar's inner
// edge, mirroring ReportingSection's height-drag precedent.
export function Sidebar({
  side, tabs, client, dropRef, tabNameMaxLength = 16, width = DEFAULT_WIDTH_PX, onWidthChange,
}: {
  side: 'left' | 'right';
  tabs: TabView[];
  client: JanusClient;
  // The active tab's command-bar drop handle, threaded down to a docked `FileTreeTab` so a drag
  // can find and insert into that tab's command bar. See `App.tsx`'s `dropRef`.
  dropRef?: React.RefObject<CommandInputDropHandle | null>;
  tabNameMaxLength?: number;
  width?: number;
  onWidthChange?: (width: number) => void;
}) {
  const [selectedView, setSelectedView] = useState<'files' | 'notifications' | 'schedules'>('files');
  const previousLabelsRef = useRef<Set<string>>(new Set());

  const onDividerDown = useCallback((down: React.MouseEvent) => {
    down.preventDefault();
    const startX = down.clientX;
    const startWidth = width;
    startDrag((move) => {
      const delta = side === 'left' ? move.clientX - startX : startX - move.clientX;
      const maxWidth = globalThis.innerWidth * (MAX_WIDTH_PCT / 100);
      onWidthChange?.(Math.min(maxWidth, Math.max(MIN_WIDTH_PX, startWidth + delta)));
    });
  }, [side, width, onWidthChange]);

  const entries = tabs.map((tab, index) => ({ tab, index })).filter((e) => e.tab.dock === side);

  // Bring a newly-docked tab into view within the sidebar, mirroring the app's rule that docking
  // always makes the docked tab fully visible.
  useEffect(() => {
    const newlyDocked = entries.find((e) => !previousLabelsRef.current.has(e.tab.label));
    if (newlyDocked) setSelectedView(newlyDocked.tab.view as 'files' | 'notifications' | 'schedules');
    previousLabelsRef.current = new Set(entries.map((e) => e.tab.label));
  }, [entries]);

  if (entries.length === 0) return null;
  const current = entries.find((e) => e.tab.view === selectedView) ?? entries[0];
  const activeIndex = entries.indexOf(current);

  const divider = <div className="sidebar-resize" onMouseDown={onDividerDown} />;

  return (
    <div className={`sidebar sidebar-${side}`} style={{ flex: `0 0 ${width}px` }} data-doc-shot={`sidebar-${side}`}>
      {side === 'right' && divider}
      <div className="sidebar-body">
        <TabStrip
          tabs={entries.map((e) => e.tab)}
          activeTab={activeIndex}
          onSelect={(i) => setSelectedView(entries[i].tab.view as 'files' | 'notifications' | 'schedules')}
          onClose={(i) => client.send({ method: 'closeTab', params: { index: entries[i].index } })}
          onRename={(i, title) => client.renameTab(entries[i].index, title)}
          tabNameMaxLength={tabNameMaxLength}
        />
        {current.tab.view === 'files' && current.tab.files && (
          <FileTreeTab
            files={current.tab.files} client={client} index={current.index} dock={current.tab.dock} autoFocus={false}
            dropRef={dropRef}
          />
        )}
        {current.tab.view === 'notifications' && (
          <NotificationsTab lines={current.tab.bufferLines} client={client} index={current.index} dock={current.tab.dock} />
        )}
        {current.tab.view === 'schedules' && (
          <SchedulesTab
            entries={current.tab.aggregatedSchedules ?? []} tabs={tabs} client={client} compact
            dock={current.tab.dock} index={current.index}
          />
        )}
      </div>
      {side === 'left' && divider}
    </div>
  );
}
