import { useMemo } from 'react';
import type { JanusClient } from '../ws/ws';
import { acpPanelActions } from './acp-panel-actions';

export function useAcpPanelActions(client: JanusClient, label: string) {
  return useMemo(() => acpPanelActions({
    send: (call) => client.send(call),
    attachPty: (id, onData) => client.attachPty(id, onData),
  }, label), [client, label]);
}
