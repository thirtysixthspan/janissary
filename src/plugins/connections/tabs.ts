import type { ConnectionsTopicNotification, TabPluginServerCapabilities } from '../api.js';
import { isConnectionRow, isConnectionsPayload, type ConnectionRow, type ConnectionsPayload } from './shared.js';
import { ConnectionRecordTabs } from './record-tabs.js';

export const CONNECTIONS_LIST_KEY = 'connections';

export function connectionsData(capabilities: TabPluginServerCapabilities): ConnectionsTopicNotification['data'] {
  const data = capabilities.topicData('connections');
  if (typeof data !== 'object' || data === null || !('rows' in data) || !Array.isArray(data.rows)
    || !data.rows.every(isConnectionRow)) {
    return capabilities.reportFailure('invalid connections topic data');
  }
  return data as ConnectionsTopicNotification['data'];
}

export class ConnectionTabs {
  private readonly records = new ConnectionRecordTabs();

  openList(capabilities: TabPluginServerCapabilities, dock: boolean): void {
    capabilities.openOrFocusTab(CONNECTIONS_LIST_KEY, () => ({
      title: 'Connections',
      payload: { kind: 'list', rows: connectionsData(capabilities).rows },
    }));
    if (!dock) capabilities.dockTab(CONNECTIONS_LIST_KEY, null);
  }

  openRecord(row: ConnectionRow, capabilities: TabPluginServerCapabilities): void {
    this.records.open(row, capabilities);
  }

  update(event: ConnectionsTopicNotification, capabilities: TabPluginServerCapabilities): void {
    for (const key of event.tabs) {
      if (key !== CONNECTIONS_LIST_KEY) continue;
      const payload: ConnectionsPayload = { kind: 'list', rows: event.data.rows };
      if (!isConnectionsPayload(payload)) return capabilities.reportFailure('invalid connections payload');
      capabilities.updateTab(key, () => ({ payload }));
    }
    this.records.update(event, capabilities);
  }

  dispose(): void {
    this.records.dispose();
  }
}
