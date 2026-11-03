import type { ConnectionsTopicNotification, TabPluginServerCapabilities } from '../api.js';
import { isConnectionRow, type ConnectionRow } from './shared.js';

type TopicRecord = Extract<ConnectionsTopicNotification['data']['rows'][number], { type: 'record' }>;
type PluginRecord = Extract<ConnectionRow, { type: 'record' }>;

export class ConnectionRecordTabs {
  open(row: ConnectionRow, capabilities: TabPluginServerCapabilities): void {
    if (row.type !== 'record') return;
    capabilities.topicAction({ topic: 'connections', action: 'load', id: row.id });
    const record = this.currentRecord(row.id, capabilities);
    if (!record) return capabilities.rejectRequest(`No connection matching "${row.id}".`);
    capabilities.openOrFocusTab(row.id, () => ({
      title: record.title,
      payload: { kind: 'connection', record },
    }));
  }

  update(event: ConnectionsTopicNotification, capabilities: TabPluginServerCapabilities): void {
    const rows = event.data.rows;
    const byId = new Map<string, TopicRecord>();
    for (const row of rows) if (row.type === 'record') byId.set(row.id, row);
    for (const key of event.tabs) {
      if (key === 'connections') continue;
      const row = byId.get(key);
      if (!row) {
        capabilities.closeOwnTab(key);
        continue;
      }
      if (!row.window) {
        capabilities.topicAction({ topic: 'connections', action: 'load', id: key });
      }
      capabilities.updateTab(key, () => ({ title: row.title, payload: { kind: 'connection', record: row } }));
    }
  }

  dispose(): void {}

  private currentRecord(id: string, capabilities: TabPluginServerCapabilities): PluginRecord | undefined {
    const data = capabilities.topicData('connections');
    if (typeof data !== 'object' || data === null || !('rows' in data) || !Array.isArray(data.rows)) {
      return capabilities.reportFailure('invalid connections topic data');
    }
    const rows: unknown[] = data.rows;
    const row = rows.find((candidate): candidate is PluginRecord =>
      isConnectionRow(candidate) && candidate.type === 'record' && candidate.id === id);
    return row;
  }
}
