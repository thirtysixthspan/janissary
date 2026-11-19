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

export type SaveHostIntent = {
  name: string;
  user: string;
  destination: string;
  path: string;
  originalName?: string;
};

export type DeleteHostIntent = { name: string };

export type SaveHostResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

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

export function isSaveHostIntent(value: unknown): value is SaveHostIntent {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.user === 'string'
    && typeof value.destination === 'string'
    && typeof value.path === 'string'
    && (value.originalName === undefined
      || (typeof value.originalName === 'string' && value.originalName.length > 0));
}

export function isDeleteHostIntent(value: unknown): value is DeleteHostIntent {
  return isRecord(value) && typeof value.name === 'string' && value.name.length > 0;
}

export function isSaveHostResult(value: unknown): value is SaveHostResult {
  return isRecord(value)
    && typeof value.ok === 'boolean'
    && typeof (value.ok ? value.name : value.error) === 'string';
}
