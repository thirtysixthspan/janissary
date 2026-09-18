import type { JanusClient } from '../ws';
import type { RemoteSessionState } from './RemoteSessionButton';

// The metadata row's detach/reattach control, built once for every tab that renders `AgentTabMeta`.
// One RPC carries both verbs, so there is nothing per-call-site to get wrong beyond which tab is
// being addressed.

export function remoteSessionControl(
  client: JanusClient,
  label: string,
  provisioning: boolean,
): { state: RemoteSessionState; onAction(action: 'detach' | 'reattach'): void } {
  return {
    state: provisioning ? 'provisioning' : 'active',
    onAction: (action) => { client.send({ method: 'remoteSession', params: { action, label } }); },
  };
}
