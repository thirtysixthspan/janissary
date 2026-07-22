import React from 'react';
import type { TabView } from '@shared/protocol';
import { AgentTabMeta } from '../AgentTabMeta';
import { StatusPanels } from '../StatusPanels';
import type { EditorConnectionsApi } from './useEditorConnections';

// Renders the connections button (in the tab's meta bar) and its floating window together, given
// the hook's return value. Split out so EditorTab.tsx only needs one import and one element,
// keeping it under the 200-line file cap (see useEditorConnections.ts's own top comment).
export function EditorConnectionsPanel({ tab, api }: { tab: TabView; api: EditorConnectionsApi }) {
  return (
    <>
      <AgentTabMeta connectionsButton={api.connectionsButton} />
      <StatusPanels tab={tab} connections={api.connections} schedule={api.schedule} interactive onCloseRow={api.closeRow} />
    </>
  );
}
