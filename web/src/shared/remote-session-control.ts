import type { RemoteTargetView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { RemoteSessionState } from './RemoteSessionButton';

// The metadata row's detach/reattach control, built once for every tab that renders `AgentTabMeta`.
// One RPC carries both verbs, so there is nothing per-call-site to get wrong beyond which tab is
// being addressed.

// Which verb the control offers is the channel's state, and the whole target is passed in so this is
// the only place that reads it. `provisioning` wins if the two ever coincide: a channel with no
// workspace cannot be mid-backoff — recovery needs a session id and a workspace both — and a control
// that is merely not pressable yet is the safe answer to a state that should not exist.
function stateOf(provisioning: boolean, remote: RemoteTargetView): RemoteSessionState {
  if (provisioning) return 'provisioning';
  return remote.reconnecting === true ? 'reconnecting' : 'active';
}

export function remoteSessionControl(
  client: JanusClient,
  label: string,
  remote: RemoteTargetView,
  provisioning: boolean,
): { state: RemoteSessionState; onAction(action: 'detach' | 'reattach'): void } {
  return {
    state: stateOf(provisioning, remote),
    onAction: (action) => { client.send({ method: 'remoteSession', params: { action, label } }); },
  };
}
