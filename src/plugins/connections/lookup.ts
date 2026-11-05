import type { TabPluginServerCapabilities } from '../api.js';
import { recordConnectionName, type ConnectionRow, type LiveConnectionRow, type RecordConnectionRow } from './shared.js';
import { connectionsData, type ConnectionTabs } from './tabs.js';

function parsedTarget(text: string): { kind: string; id: string } | undefined {
  const separator = text.indexOf(':');
  if (separator === -1) return undefined;
  return { kind: text.slice(0, separator).toLowerCase(), id: text.slice(separator + 1) };
}

function recordById(rows: ConnectionRow[], id: string): ConnectionRow | undefined {
  return rows.find((row) => row.type === 'record' && row.id === id);
}

function acpRecordForOwner(rows: ConnectionRow[], ownerLabel: string, model: string): ConnectionRow | undefined {
  return rows.find((row) => row.type === 'record' && row.kind === 'acp'
    && ['Idle', 'Running'].includes(row.status) && row.ownerLabel === ownerLabel && row.model === model);
}

function liveTarget(
  rows: ConnectionRow[],
  target: { kind: string; id: string },
  ownerLabel?: string,
): ConnectionRow | undefined {
  const matches = rows.filter((row): row is LiveConnectionRow =>
    row.type === 'live' && row.kind === target.kind && row.id === target.id);
  return matches.find((row) => row.ownerLabel === ownerLabel) ?? matches[0];
}

function newestRecord(
  rows: ConnectionRow[],
  text: string,
  label: (row: RecordConnectionRow) => string,
): ConnectionRow | undefined {
  const wanted = text.toLowerCase();
  return rows.filter((row): row is RecordConnectionRow => row.type === 'record' && label(row).toLowerCase() === wanted)
    .toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0];
}

function openRow(row: ConnectionRow, tabs: ConnectionTabs, capabilities: TabPluginServerCapabilities): void {
  if (row.type === 'record') {
    tabs.openRecord(row, capabilities);
    return;
  }
  capabilities.topicAction({ topic: 'connections', action: 'open', kind: row.kind, id: row.id, ownerLabel: row.ownerLabel });
}

export function openConnectionLookup(
  text: string,
  tabs: ConnectionTabs,
  capabilities: TabPluginServerCapabilities,
): boolean {
  const rows = connectionsData(capabilities).rows;
  const origin = capabilities.originTab();
  const exactRecord = recordById(rows, text);
  if (exactRecord) {
    openRow(exactRecord, tabs, capabilities);
    return true;
  }

  const target = parsedTarget(text);
  if (target?.kind === 'acp' && origin) {
    const record = acpRecordForOwner(rows, origin.label, target.id);
    if (record) {
      openRow(record, tabs, capabilities);
      return true;
    }
  }
  if (target) {
    const live = liveTarget(rows, target, origin?.label);
    if (live) {
      openRow(live, tabs, capabilities);
      return true;
    }
  }
  const record = newestRecord(rows, text, (row) => row.title) ?? newestRecord(rows, text, recordConnectionName);
  if (record) {
    openRow(record, tabs, capabilities);
    return true;
  }
  return false;
}
