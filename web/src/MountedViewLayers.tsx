import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { HarnessTabHandle } from './HarnessTab';
import { EditorTab, type EditorTabHandle } from './EditorTab';
import { PageTab } from './PageTab';
import { HarnessTabLayer } from './HarnessTabLayer';
import type { PickerOverlayProps } from './picker-overlay-props';

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
} & PickerOverlayProps;

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
        <HarnessTabLayer
          key={t.harness!.ptyId}
          t={t} current={current} tabs={tabs} client={client} harnessHandles={harnessHandles}
          taskPickerOpen={taskPickerOpen} taskRows={taskRows} taskPickerIndex={taskPickerIndex}
          onPickTask={onPickTask} onToggleTaskDir={onToggleTaskDir}
          navOpen={navOpen} navQuery={navQuery} navIndex={navIndex} onPickTab={onPickTab}
        />
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
