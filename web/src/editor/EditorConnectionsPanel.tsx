import React from 'react';
import type { TabView } from '@shared/protocol';
import { StatusPanels } from '../StatusPanels';
import type { EditorConnectionsApi } from './useEditorConnections';

// Renders the connections window floating panel, given the hook's return value. The connections
// button itself renders inline in EditorTab's single metadata row; split out here so EditorTab.tsx
// only needs one import and one element, keeping it under the 200-line file cap (see
// useEditorConnections.ts's own top comment).
export function EditorConnectionsPanel({ tab, api }: { tab: TabView; api: EditorConnectionsApi }) {
  return (
    <StatusPanels tab={tab} connections={api.connections} schedule={api.schedule} interactive onCloseRow={api.closeRow} />
  );
}
