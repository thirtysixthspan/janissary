import type { ConnectionsPayload } from '@shared/plugins/connections/shared';
import type { TabPluginClientCapabilities } from '../api';
import '../shared.css';
import './connections.css';
import { ConnectionList } from './ConnectionList';
import { ConnectionTab } from './ConnectionTab';

export { isConnectionsPayload as isPayload } from '@shared/plugins/connections/shared';

type ConnectionsProperties = { payload: ConnectionsPayload; capabilities: TabPluginClientCapabilities };

export default function ConnectionsPlugin({ payload, capabilities }: ConnectionsProperties) {
  if (payload.kind === 'list') return <ConnectionList rows={payload.rows} capabilities={capabilities} />;
  if (payload.record.type === 'record') return <ConnectionTab record={payload.record} capabilities={capabilities} />;
  return null;
}
