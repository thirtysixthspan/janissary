import type { JanusClient } from '../ws';

// Read only the bound tab and replay retained replies when a renderer subscribes.
export function subscribeBackgroundReplies(client: JanusClient, label: string, receive: (reply: { id: string; output: string }) => void): () => void {
  return client.onState((state) => {
    const replies = state.tabs.find((tab) => tab.label === label)?.backgroundReplies ?? [];
    for (const reply of replies) {
      receive(reply);
    }
  });
}
