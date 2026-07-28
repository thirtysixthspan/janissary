import React, { useCallback, useRef, useState } from 'react';
import type { TabView } from '@shared/protocol';
import { TabStrip } from './TabStrip';
import type { JanusClient } from './ws';
import { ResizeButton } from './ResizeButton';
import { beginResizeDrag } from './drag-resize';
import type { TabEntry } from './useTabEntries';

const MIN_PCT = 15;
const MAX_PCT = 85;

type Properties = {
  entries: TabEntry[];
  tabs: TabView[];
  activeTab: number;
  secondaryTab?: number;
  client: JanusClient;
  closeTab: (index: number) => void;
  tabNameMaxLength: number;
  activeTabNameMaxLength: number;
  onFocusCommandBar: () => void;
  onFocusEditor: (label: string) => void;
  windowFocused: boolean;
  renderBody: (entry: TabEntry, focused: boolean) => React.ReactNode;
  persistentLayers: React.ReactNode;
};

function paneOf(tab: TabView): 'left' | 'right' {
  return tab.pane ?? 'left';
}

export function CenterActionArea({
  entries, tabs, activeTab, secondaryTab, client, closeTab, tabNameMaxLength,
  activeTabNameMaxLength, onFocusCommandBar, onFocusEditor, windowFocused,
  renderBody, persistentLayers,
}: Properties) {
  const [leftPct, setLeftPct] = useState(50);
  const areaRef = useRef<HTMLDivElement>(null);
  const split = secondaryTab !== undefined;
  const paneEntries = (pane: 'left' | 'right') =>
    entries.filter((entry) => paneOf(entry.tab) === pane);
  const selectedIndex = (pane: 'left' | 'right') => {
    const focused = tabs[activeTab];
    return focused && paneOf(focused) === pane ? activeTab : secondaryTab;
  };
  const onResize = useCallback((_down: React.MouseEvent, move: MouseEvent) => {
    const bounds = areaRef.current?.getBoundingClientRect();
    const width = bounds && bounds.width > 0 ? bounds.width : globalThis.innerWidth;
    const left = bounds?.width ? bounds.left : 0;
    const pct = ((move.clientX - left) / width) * 100;
    setLeftPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  const renderPane = (pane: 'left' | 'right') => {
    const visibleEntries = paneEntries(pane);
    const selected = selectedIndex(pane);
    const current = visibleEntries.find((entry) => entry.index === selected) ?? visibleEntries[0];
    if (!current) return null;
    const localActive = visibleEntries.indexOf(current);
    return (
      <>
        <TabStrip
          className={`center-strip center-strip-${pane}`}
          tabs={visibleEntries.map((entry) => entry.tab)}
          activeTab={localActive}
          onSelect={(index) => client.send({
            method: 'setActiveTab', params: { index: visibleEntries[index].index },
          })}
          onClose={(index) => closeTab(visibleEntries[index].index)}
          onRename={(index, title) => client.renameTab(visibleEntries[index].index, title)}
          onReorder={(from, to) => client.send({
            method: 'reorderTabTo',
            params: { from: visibleEntries[from].index, to: visibleEntries[to].index },
          })}
          tabNameMaxLength={tabNameMaxLength}
          activeTabNameMaxLength={activeTabNameMaxLength}
          onFocusCommandBar={onFocusCommandBar}
          onFocusEditor={onFocusEditor}
          windowFocused={windowFocused}
          endControl={pane === 'left' && split
            ? <ResizeButton direction="horizontal" label="Resize split panes" onResize={onResize} />
            : undefined}
        />
        <div
          className={`center-pane-body center-pane-body-${pane}`}
          data-pane-index={current.index}
        >
          {renderBody(current, current.index === activeTab)}
        </div>
      </>
    );
  };

  return (
    <div
      ref={areaRef}
      className={`center-action-area${split ? ' center-action-split' : ''}`}
      style={{ '--center-left-pct': `${split ? leftPct : 100}%` } as React.CSSProperties}
      onPointerDownCapture={(event) => {
        const element = (event.target as Element).closest<HTMLElement>('[data-pane-index]');
        const index = Number(element?.dataset.paneIndex);
        if (Number.isSafeInteger(index) && index !== activeTab) {
          client.send({ method: 'setActiveTab', params: { index } });
        }
      }}
    >
      {renderPane('left')}
      {split && renderPane('right')}
      {persistentLayers}
      {split && (
        <div
          className="center-split-resize"
          onMouseDown={(down) => beginResizeDrag(down, onResize)}
        />
      )}
    </div>
  );
}
