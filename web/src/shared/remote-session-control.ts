import type { RemoteTargetView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import type { RemoteSessionState } from './RemoteSessionButton';

// The metadata row's detach/attach control, built once for every tab that renders `AgentTabMeta`.
// One RPC carries both verbs, so there is nothing per-call-site to get wrong beyond which tab is
// being addressed.

// Which verb the control offers is the channel's state, and the whole target is passed in so this is
// the only place that reads it. Both state facts are resolved server-side onto the view —
// `provisioning` from the channel's own workspace-absence test, `reconnecting` from the channel's
// recovery, neither stored on the tab — so nothing per-call-site is re-derived. `provisioning` wins
// if the two ever coincide: a channel with no workspace cannot be mid-backoff — recovery needs a
// session id and a workspace both — and a control that is merely not pressable yet is the safe
// answer to a state that should not exist.
function stateOf(provisioning: boolean, remote: RemoteTargetView): RemoteSessionState {
  if (provisioning) return 'provisioning';
  return remote.reconnecting === true ? 'reconnecting' : 'active';
}

// Raised as a request rather than a fire-and-forget send, so the control has something to stop
// spinning on. The promise settles in every case: on the server's answer, and — because `request`
// resolves `undefined` for a socket that is not open or a connection that ends first — on a request
// nobody answers. It resolves to whether the action actually ran, which is what the feed's line
// explains when it did not.
async function raise(client: JanusClient, action: 'detach' | 'attach', label: string): Promise<boolean> {
  const call = { method: 'remoteSession' as const, params: { action, label } };
  if (typeof client.request !== 'function') { client.send(call); return false; }
  const result = await client.request<boolean>(call);
  return result.ok && result.value;
}

export function remoteSessionControl(
  client: JanusClient,
  label: string,
  remote: RemoteTargetView,
): { state: RemoteSessionState; onAction(action: 'detach' | 'attach'): Promise<boolean> } {
  return {
    state: stateOf(remote.provisioning === true, remote),
    onAction: (action) => raise(client, action, label),
  };
}
