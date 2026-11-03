import type { ConnectionsPayload } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';

export { isConnectionsPayload as isPayload } from '@shared/plugins/connections/shared';

type ConnectionsProperties = { payload: ConnectionsPayload; capabilities: TabPluginClientCapabilities };

export default function ConnectionsPlugin(_properties: ConnectionsProperties): null {
  return null;
}
