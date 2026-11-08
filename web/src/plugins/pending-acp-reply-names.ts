import type { PendingAcpReplyNameView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';

export function subscribePendingAcpReplyNames(
  client: JanusClient, label: string, receive: (update: PendingAcpReplyNameView) => void,
): () => void {
  return client.onState((state) => {
    const updates = state.tabs.find((tab) => tab.label === label)?.pendingAcpReplyNames ?? [];
    for (const update of updates) receive(update);
  });
}
