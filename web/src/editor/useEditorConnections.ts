// Wires an editor tab into the same button-driven connections window tabs use (see
// `useStatusWindows`). Split out of EditorTab.tsx to stay under the 200-line file cap, mirroring
// useEditorSuggest.ts's own extraction for the same reason.

import type { TabView, ConnectionView, AcpRef } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import { statusButton, type StatusWindowButtonProps } from '../shared/status-windows/status-button';
import { useStatusWindows } from '../shared/status-windows/useStatusWindows';

export type EditorConnectionsApi = {
  windows: ReturnType<typeof useStatusWindows>;
  connectionsButton: StatusWindowButtonProps;
  openAcpTranscript: (acpRef: AcpRef) => void;
  openRow: (row: ConnectionView) => void;
};

export function useEditorConnections(client: JanusClient, tab: TabView): EditorConnectionsApi {
  const windows = useStatusWindows(tab.label, { connectionsHaveContent: tab.connections.length > 0 });

  const openAcpTranscript = (acpRef: AcpRef) => {
    client.send({ method: 'openAcpTranscript', params: { acpRef } });
  };

  const openRow = (row: ConnectionView) => {
    if (row.recordId !== undefined) {
      client.send({ method: 'openConnectionRecord', params: { tab: tab.label, recordId: row.recordId } });
      return;
    }
    if (row.acpRef?.scope !== 'tab' || row.acpRef.label !== tab.label) return;
    client.send({ method: 'openConnectionRecord', params: { tab: tab.label, acpRef: row.acpRef } });
  };

  const connectionsButton = statusButton(tab.connections.length > 0, windows.connections);

  return { windows, connectionsButton, openAcpTranscript, openRow };
}
