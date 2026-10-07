import { useMemo } from 'react';
import type { RemoteTargetView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { remoteSessionControl } from '../shared/remote-session-control';

// Tab views are rebuilt on each server snapshot. Keep the remote capability values stable when
// those snapshots describe the same session, so PluginBody's capability object remains stable too.
export function usePluginRemote(remote: RemoteTargetView | undefined, client: JanusClient, label: string) {
  const address = remote?.address;
  const host = remote?.host;
  const reconnecting = remote?.reconnecting;
  const provisioning = remote?.provisioning;
  const stableRemote = useMemo<RemoteTargetView | undefined>(() => {
    if (address === undefined || host === undefined) return;
    return { address, host, ...(reconnecting === true && { reconnecting }), ...(provisioning === true && { provisioning }) };
  }, [address, host, provisioning, reconnecting]);
  const remoteSession = useMemo(
    () => stableRemote === undefined ? undefined : remoteSessionControl(client, label, stableRemote),
    [client, label, stableRemote],
  );
  return useMemo(() => ({ remote: stableRemote, remoteSession }), [remoteSession, stableRemote]);
}
