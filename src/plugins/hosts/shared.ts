export const HOSTS_PAYLOAD_SCHEMA_VERSION = 1;

export type HostRow = {
  name: string;
  user: string;
  destination: string;
  path: string;
};

export type HostsPayload = {
  filePath: string;
  rows: HostRow[];
};

export type RefreshIntent = Record<string, never>;

export type OpenIntent = { name: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHostRow(value: unknown): value is HostRow {
  return isRecord(value)
    && typeof value.name === 'string'
    && value.name.length > 0
    && typeof value.user === 'string'
    && typeof value.destination === 'string'
    && value.destination.length > 0
    && typeof value.path === 'string';
}

export function isHostsPayload(value: unknown): value is HostsPayload {
  return isRecord(value)
    && typeof value.filePath === 'string'
    && Array.isArray(value.rows)
    && value.rows.every((row) => isHostRow(row));
}

export function isRefreshIntent(value: unknown): value is RefreshIntent {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isOpenIntent(value: unknown): value is OpenIntent {
  return isRecord(value) && typeof value.name === 'string' && value.name.length > 0;
}
