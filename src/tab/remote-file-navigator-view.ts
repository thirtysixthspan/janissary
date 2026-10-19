import type { RemoteTarget } from './types.js';
import type { RemoteTargetView } from '../protocol/tab.js';

export function remoteFileNavigatorTarget(
  remote: RemoteTarget | undefined,
  label: string,
  workspaceOf?: (label: string) => string | undefined,
  reconnectingOf?: (label: string) => boolean,
): RemoteTargetView | undefined {
  if (!remote) return undefined;
  const provisioning = workspaceOf !== undefined && workspaceOf(label) === undefined;
  const reconnecting = reconnectingOf?.(label) === true;
  return {
    ...remote,
    ...(reconnecting && { reconnecting: true }),
    ...(provisioning && { provisioning: true }),
  };
}
