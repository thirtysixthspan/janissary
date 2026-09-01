// Wires an editor tab into the same button-driven connections window agent tabs use (see
// `useStatusWindows`), plus a close control on each persona connection row. Split out of
// EditorTab.tsx to stay under the 200-line file cap, mirroring useEditorSuggest.ts's own extraction
// for the same reason (see product/plans/ready/editor-tab-persona-connections.md).

import type { TabView, ConnectionView, AcpRef } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { statusButton, type StatusWindowButtonProps } from '../status-button';
import { useStatusWindows } from '../useStatusWindows';
import { isEditorTabView } from '../shared/tab-view-guards';

export type EditorConnectionsApi = ReturnType<typeof useStatusWindows> & {
  connectionsButton: StatusWindowButtonProps;
  closeRow: (row: ConnectionView) => void;
  openAcpTranscript: (acpRef: AcpRef) => void;
};

export function useEditorConnections(client: JanusClient, tab: TabView): EditorConnectionsApi {
  const windows = useStatusWindows(tab.label, tab.connections.length > 0, false);

  // There is no connection to close without the editor payload that names the file, so a tab missing
  // it is left alone rather than dereferenced — the row simply does nothing.
  const closeRow = (row: ConnectionView) => {
    if (!isEditorTabView(tab)) return;
    const persona = row.text.replace(/ \(acp\)$/, '');
    client.send({ method: 'closeEditorConnection', params: { url: tab.editor.url, persona } });
  };

  const openAcpTranscript = (acpRef: AcpRef) => {
    client.send({ method: 'openAcpTranscript', params: { acpRef } });
  };

  const connectionsButton = statusButton(tab.connections.length > 0, windows.connections);

  return { ...windows, connectionsButton, closeRow, openAcpTranscript };
}
