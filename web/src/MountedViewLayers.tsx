import React from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessTab, type HarnessTabHandle } from './HarnessTab';
import { EditorTab, type EditorTabHandle } from './EditorTab';
import { StatusPanels } from './StatusPanels';

type Properties = {
  tabs: TabView[];
  current: TabView;
  client: JanusClient;
  harnessHandles: React.RefObject<Map<string, HarnessTabHandle>>;
  editorHandles: React.RefObject<Map<string, EditorTabHandle>>;
};

// Harness and editor tabs stay mounted (hidden when inactive) so terminal/xterm state and editor
// buffers, undo stacks, cursor, and scroll position survive tab switches. Split out of App.tsx to
// keep it under the file-size limit.
export function MountedViewLayers({ tabs, current, client, harnessHandles, editorHandles }: Properties) {
  return (
    <>
      {tabs.filter((t) => t.view === 'harness' && t.harness).map((t) => (
        <div
          key={t.harness!.ptyId}
          className="tab-body"
          style={{ borderLeft: `4px solid ${t.dotColor}`, position: 'relative', display: t.label === current.label ? 'flex' : 'none' }}
        >
          <HarnessTab harness={t.harness!} client={client}
            ref={(h) => { if (h) harnessHandles.current.set(t.harness!.ptyId, h); else harnessHandles.current.delete(t.harness!.ptyId); }} />
          <StatusPanels tab={t} scheduleOnly={t.harness!.name !== 'ssh'} />
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
    </>
  );
}
