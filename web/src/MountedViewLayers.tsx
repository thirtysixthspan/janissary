import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessTab, type HarnessTabHandle } from './HarnessTab';
import { EditorTab, type EditorTabHandle } from './EditorTab';
import { PageTab } from './PageTab';
import { StatusPanels } from './StatusPanels';
import { TaskPicker } from './TaskPicker';
import { TabNavPicker } from './TabNavPicker';
import type { VisibleTaskRow } from './task-picker-keys';

type Properties = {
  tabs: TabView[];
  current: TabView;
  client: JanusClient;
  closeTab: (index: number) => void;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  editorHandles: React.RefObject<Map<string, EditorTabHandle>>;
  // Ctrl+A and Ctrl+G open the task picker and tab navigator from a focused harness tab (see
  // `HarnessTab.harnessKeyFilter`); they're the only pickers/choosers those chords ever let bubble
  // there, so this renders just those two overlays rather than the full `PickerOverlays` stack the
  // agent-tab body uses.
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

// Harness, editor, and page tabs stay mounted (hidden when inactive) so terminal/xterm state,
// editor buffers, undo stacks, cursor/scroll position, and embedded-page navigation survive tab
// switches. Split out of App.tsx to keep it under the file-size limit.
export function MountedViewLayers({
  tabs, current, client, closeTab, harnessHandles, editorHandles,
  taskPickerOpen, taskRows, taskPickerIndex, onPickTask, onToggleTaskDir,
  navOpen, navQuery, navIndex, onPickTab,
}: Properties) {
  return (
    <>
      {tabs.filter((t) => t.view === 'harness' && t.harness).map((t) => (
        <div
          key={t.harness!.ptyId}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, position: 'relative', display: t.label === current.label ? 'flex' : 'none' }}
        >
          <HarnessTab harness={t.harness!} client={client} cwd={t.cwd} flags={t.flags} label={t.label}
            taskPickerOpen={!!taskPickerOpen && t.label === current.label}
            navOpen={!!navOpen && t.label === current.label}
            ref={(h) => { if (h) harnessHandles.current.set(t.harness!.ptyId, h); else harnessHandles.current.delete(t.harness!.ptyId); }} />
          <StatusPanels tab={t} scheduleOnly={t.harness!.name !== 'ssh'} />
          {taskPickerOpen && t.label === current.label && onPickTask && onToggleTaskDir && (
            <TaskPicker rows={taskRows ?? []} selected={taskPickerIndex ?? 0} onPick={onPickTask} onToggleDir={onToggleTaskDir} />
          )}
          {navOpen && t.label === current.label && onPickTab && (
            <TabNavPicker tabs={tabs} query={navQuery ?? ''} selected={navIndex ?? 0} onPick={onPickTab} />
          )}
        </div>
      ))}

      {tabs.filter((t) => t.view === 'editor' && t.editor).map((t) => (
        <div
          key={t.editor!.url}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, display: t.label === current.label ? 'flex' : 'none' }}
        >
          <EditorTab editor={t.editor!} client={client} active={t.label === current.label}
            ref={(h) => { if (h) editorHandles.current.set(t.label, h); else editorHandles.current.delete(t.label); }} />
        </div>
      ))}

      {tabs
        .map((t, index) => ({ t, index }))
        .filter(({ t }) => t.view === 'page' && t.page)
        .map(({ t, index }) => (
          <div
            key={t.page!.url}
            className="tab-body"
            style={{ borderLeft: `4px solid ${t.dotColor}`, display: t.label === current.label ? 'flex' : 'none' }}
          >
            <PageTab page={t.page!} closeTab={closeTab} index={index} client={client} />
          </div>
        ))}
    </>
  );
}
