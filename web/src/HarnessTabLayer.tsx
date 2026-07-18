import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessTab, type HarnessTabHandle } from './HarnessTab';
import { StatusPanels } from './StatusPanels';
import { TaskPicker } from './TaskPicker';
import { TabNavPicker } from './TabNavPicker';
import { useStatusWindows } from './useStatusWindows';
import type { VisibleTaskRow } from './task-picker-keys';

type Properties = {
  t: TabView;
  current: TabView;
  tabs: TabView[];
  client: JanusClient;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  taskPickerOpen?: boolean;
  taskRows?: VisibleTaskRow[];
  taskPickerIndex?: number;
  onPickTask?: (path: string) => void;
  onToggleTaskDir?: (path: string) => void;
  navOpen?: boolean;
  navQuery?: string;
  navIndex?: number;
  onPickTab?: (index: number) => void;
};

// One harness tab's body (terminal + meta bar) plus its status panels and picker overlays.
// Split out of `MountedViewLayers` so `useStatusWindows` can be instantiated once per harness
// tab rather than inside that component's per-tab `.map`, which would violate the rules of hooks.
// All harness tabs stay mounted (hidden via `display: none`) so `t.label === current.label` is
// this tab's own "just became active" signal, gating auto-show even though it never unmounts.
export function HarnessTabLayer({
  t, current, tabs, client, harnessHandles,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  navOpen, navQuery, navIndex, onPickTab,
}: Properties) {
  const isActive = t.label === current.label;
  const scheduleOnly = t.harness!.name !== 'ssh';
  const statusWindows = useStatusWindows(
    current.label,
    isActive && !scheduleOnly && t.connections.length > 0,
    isActive && t.schedule.length > 0,
  );
  return (
    <div
      className="tab-body"
      style={{ borderLeft: `4px solid ${t.dotColor}`, position: 'relative', display: isActive ? 'flex' : 'none' }}
    >
      <HarnessTab harness={t.harness!} client={client} cwd={t.cwd} flags={t.flags} label={t.label}
        taskPickerOpen={!!taskPickerOpen && isActive}
        navOpen={!!navOpen && isActive}
        connectionsButton={scheduleOnly ? undefined : {
          hasContent: t.connections.length > 0,
          onEnter: statusWindows.connections.onButtonEnter,
          onLeave: statusWindows.connections.onButtonLeave,
          onClick: statusWindows.connections.onButtonClick,
        }}
        scheduleButton={{
          hasContent: t.schedule.length > 0,
          onEnter: statusWindows.schedule.onButtonEnter,
          onLeave: statusWindows.schedule.onButtonLeave,
          onClick: statusWindows.schedule.onButtonClick,
        }}
        ref={(h) => { if (h) harnessHandles.current.set(t.harness!.ptyId, h); else harnessHandles.current.delete(t.harness!.ptyId); }} />
      <StatusPanels tab={t} scheduleOnly={scheduleOnly} connections={statusWindows.connections} schedule={statusWindows.schedule} />
      {taskPickerOpen && isActive && onPickTask && onToggleTaskDir && (
        <TaskPicker rows={taskRows ?? []} selected={taskPickerIndex ?? 0} onPick={onPickTask} onToggleDir={onToggleTaskDir} />
      )}
      {navOpen && isActive && onPickTab && (
        <TabNavPicker tabs={tabs} query={navQuery ?? ''} selected={navIndex ?? 0} onPick={onPickTab} />
      )}
    </div>
  );
}
