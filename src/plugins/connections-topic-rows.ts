import { connectionCatalog } from '../connection/catalog.js';
import type { AcpRef } from '../protocol/tab.js';
import { bareHost } from '../remote/address.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';
import type { ConnectionsTopicData, ConnectionsTopicLiveRow, ConnectionsTopicRecordRow } from '../protocol/connections.js';

export function composeConnectionsTopicData(
  managers: Managers,
  requestedWindows: Map<string, number>,
): ConnectionsTopicData {
  const records = managers.acpRecords.rows();
  const recordIds = new Set(records.map((record) => record.id));
  const openTabIds = openPluginTabIds(managers);
  for (const id of requestedWindows.keys()) {
    if (!recordIds.has(id) || !openTabIds.has(id)) requestedWindows.delete(id);
  }
  const rows = [
    ...liveTabRows(managers, recordIds),
    ...databaseRows(managers),
    ...durableRows(managers, records, requestedWindows),
  ];

  rows.sort((a, b) => b.orderingTimestamp - a.orderingTimestamp
    || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { rows };
}

const LOCAL_HOST = 'Local';

// The host a tab's connections run on: a remote tab runs over its ssh session, and an ssh harness tab
// is that session, so both read as the bare host they reach. Everything else runs here.
function tabHost(tab: Tab): string {
  if (tab.remote) return tab.remote.host;
  if (tab.harness?.name === 'ssh' && tab.harness.destination) return bareHost(tab.harness.destination);
  return LOCAL_HOST;
}

function openPluginTabIds(managers: Managers): Set<string> {
  return new Set(managers.tab.tabs.flatMap((tab) => (tab.plugin ? [tab.plugin.instanceKey] : [])));
}

function liveTabRows(managers: Managers, recordIds: Set<string>): ConnectionsTopicLiveRow[] {
  const rows: ConnectionsTopicLiveRow[] = [];
  for (const tab of managers.tab.tabs) {
    for (const connection of connectionCatalog(managers, tab.label)) {
      if (connection.scope !== 'tab' || connection.kind === 'sqlite') continue;
      if (isTrackedCoreAcp(connection.acpRef, tab.runtime?.acpRecordId, tab.label, recordIds)) continue;
      rows.push({
        type: 'live', id: connection.id, kind: connection.kind, display: connection.display, host: tabHost(tab),
        ownerLabel: tab.label, ownerName: tab.title ?? tab.label, status: 'Open',
        orderingTimestamp: tab.runtime?.lastActivity ?? 0, focusTarget: tab.label,
        ...(connection.acpRef && { acpRef: connection.acpRef }),
      });
    }
  }
  return rows;
}

function isTrackedCoreAcp(
  acpRef: AcpRef | undefined,
  recordId: string | undefined,
  label: string,
  recordIds: Set<string>,
): boolean {
  return acpRef?.scope === 'tab' && acpRef.label === label && recordId !== undefined && recordIds.has(recordId);
}

function databaseRows(managers: Managers): ConnectionsTopicLiveRow[] {
  return managers.database.listOpen().map((name) => {
    const attributed = managers.tab.tabs.filter((tab) => managers.database.openDbs(tab.label).includes(name));
    const focusTab = attributed[0];
    let orderingTimestamp = 0;
    for (const tab of attributed) orderingTimestamp = Math.max(orderingTimestamp, tab.runtime?.lastActivity ?? 0);
    return {
      type: 'live', id: name, kind: 'sqlite', display: `sqlite:${name}`, host: LOCAL_HOST,
      ownerLabel: focusTab?.label ?? '', ownerName: 'global',
      status: 'Open', orderingTimestamp,
      ...(focusTab && { focusTarget: focusTab.label }),
    };
  });
}

function durableRows(
  managers: Managers,
  records: ReturnType<Managers['acpRecords']['rows']>,
  requestedWindows: Map<string, number>,
): ConnectionsTopicRecordRow[] {
  return records.map((record) => {
    const count = requestedWindows.get(record.id);
    const window = count === undefined ? undefined : managers.acpRecords.window(record.id, count);
    return {
      type: 'record', ...record, host: record.host ?? LOCAL_HOST, orderingTimestamp: record.updatedAt,
      ...(window && { window }),
    };
  });
}
