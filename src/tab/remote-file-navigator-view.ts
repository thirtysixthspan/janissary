import type { RemoteTarget } from './types.js';

export function remoteFileNavigatorTarget(
  remote: RemoteTarget | undefined,
  label: string,
  workspaceOf?: (label: string) => string | undefined,
  reconnectingOf?: (label: string) => boolean,
): (RemoteTarget & { reconnecting?: boolean; provisioning?: boolean }) | undefined {
  if (!remote) return undefined;
  const provisioning = workspaceOf !== undefined && workspaceOf(label) === undefined;
  const reconnecting = reconnectingOf?.(label) === true;
  return {
    ...remote,
    ...(reconnecting && { reconnecting: true }),
    ...(provisioning && { provisioning: true }),
  };
}
