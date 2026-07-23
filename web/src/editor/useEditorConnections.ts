// Wires an editor tab into the same button-driven connections window agent tabs use (see
// `useStatusWindows`), plus a close control on each persona connection row. Split out of
// EditorTab.tsx to stay under the 200-line file cap, mirroring useEditorSuggest.ts's own extraction
// for the same reason (see product/plans/ready/editor-tab-persona-connections.md).

import type { TabView, ConnectionView, AcpRef } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { StatusWindowButtonProps } from '../AgentTabMeta';
import { useStatusWindows } from '../useStatusWindows';

export type EditorConnectionsApi = ReturnType<typeof useStatusWindows> & {
  connectionsButton: StatusWindowButtonProps;
  closeRow: (row: ConnectionView) => void;
  openAcpTranscript: (acpRef: AcpRef) => void;
};

export function useEditorConnections(client: JanusClient, tab: TabView): EditorConnectionsApi {
  const windows = useStatusWindows(tab.label, tab.connections.length > 0, false);

  const closeRow = (row: ConnectionView) => {
    const persona = row.text.replace(/ \(acp\)$/, '');
    client.send({ method: 'closeEditorConnection', params: { url: tab.editor!.url, persona } });
  };

  const openAcpTranscript = (acpRef: AcpRef) => {
    client.send({ method: 'openAcpTranscript', params: { acpRef } });
  };

  const connectionsButton: StatusWindowButtonProps = {
    hasContent: tab.connections.length > 0,
    onEnter: windows.connections.onButtonEnter,
    onLeave: windows.connections.onButtonLeave,
    onClick: windows.connections.onButtonClick,
  };

  return { ...windows, connectionsButton, closeRow, openAcpTranscript };
}
