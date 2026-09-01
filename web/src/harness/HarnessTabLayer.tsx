import React from 'react';
import type { TabView } from '@shared/protocol';
import type { HarnessTabView } from '../shared/tab-view-guards';
import type { JanusClient } from '../ws';
import { HarnessTab } from './HarnessTab';
import type { HarnessTabHandle } from '../tab-handles';
import { StatusPanels } from '../StatusPanels';
import { useStatusWindows } from '../useStatusWindows';
import { tabBodyBorder } from '../tab-body-border';
import { statusButton } from '../status-button';

type Properties = {
  // Narrowed by the caller's guard, so the harness payload is read without asserting: a harness tab
  // caught without one is never rendered rather than throwing here.
  t: HarnessTabView;
  current: TabView;
  client: JanusClient;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  visible: boolean;
  index: number;
  onSplit?: () => void;
  taskPickerOpen?: boolean;
  navOpen?: boolean;
  pickerOverlays?: React.ReactNode;
};

// One harness tab's body (terminal + meta bar) plus its status panels and picker overlays.
// Split out of `MountedViewLayers` so `useStatusWindows` can be instantiated once per harness
// tab rather than inside that component's per-tab `.map`, which would violate the rules of hooks.
// All harness tabs stay mounted (hidden via `display: none`) so `t.label === current.label` is
// this tab's own "just became active" signal, gating auto-show even though it never unmounts.
export function HarnessTabLayer({
  t, current, client, harnessHandles, visible, index, onSplit,
  taskPickerOpen, navOpen, pickerOverlays,
}: Properties) {
  const isActive = t.label === current.label;
  const scheduleOnly = t.harness.name !== 'ssh';
  const statusWindows = useStatusWindows(
    current.label,
    isActive && !scheduleOnly && t.connections.length > 0,
    isActive && t.schedule.length > 0,
  );
  return (
    <div
      className="tab-body"
      data-pane-index={index}
      style={{
        borderLeft: tabBodyBorder(t.dotColor, isActive), position: 'relative',
        display: visible ? 'flex' : 'none',
        gridColumn: t.pane === 'right' ? 2 : 1,
        gridRow: 2,
      }}
    >
      <HarnessTab harness={t.harness} client={client} cwd={t.cwd} flags={t.flags} remote={t.remote} label={t.label}
        taskPickerOpen={!!taskPickerOpen && isActive}
        navOpen={!!navOpen && isActive}
        connectionsButton={scheduleOnly ? undefined : statusButton(t.connections.length > 0, statusWindows.connections)}
        scheduleButton={statusButton(t.schedule.length > 0, statusWindows.schedule)}
        onSplit={onSplit}
        ref={(h) => { if (h) harnessHandles.current.set(t.harness.ptyId, h); else harnessHandles.current.delete(t.harness.ptyId); }} />
      <StatusPanels tab={t} scheduleOnly={scheduleOnly} connections={statusWindows.connections} schedule={statusWindows.schedule} />
      {pickerOverlays}
    </div>
  );
}
