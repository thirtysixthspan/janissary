import { useState } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { DockCycleHeader } from '../DockCycleHeader';
import { PluginBody } from './PluginBody';
import { DockedActionsContext } from './PluginActionsHeader';

// One plugin tab docked into a sidebar. The host owns the frame here exactly as it does in the
// centre: the dock-cycle control and a slot for plugin actions sit above the plugin's body, since a
// plugin may not render or import host chrome, and the body itself stays mounted while another entry in the
// same sidebar is showing — hiding it any other way would throw away the view state (a video's
// position, a document's scroll offset) that a persistent mount exists to keep.
export function DockedPluginBody({
  tab,
  index,
  visible,
  client,
  onClose,
}: {
  tab: TabView;
  index: number;
  visible: boolean;
  client: JanusClient;
  onClose: () => void;
}) {
  const [actionsTarget, setActionsTarget] = useState<HTMLSpanElement | null>(null);
  if (!tab.plugin) return null;
  return (
    <div className="sidebar-plugin" style={{ display: visible ? 'flex' : 'none' }}>
      <DockCycleHeader dock={tab.dock} client={client} index={index} classPrefix="sidebar-plugin">
        <span className="sidebar-plugin-actions" ref={setActionsTarget} />
      </DockCycleHeader>
      <DockedActionsContext.Provider value={actionsTarget}>
        <PluginBody
          plugin={tab.plugin} label={tab.label} client={client} active={visible} dock={tab.dock ?? null}
          onClose={onClose}
        />
      </DockedActionsContext.Provider>
    </div>
  );
}
