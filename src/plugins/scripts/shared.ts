export const SCRIPTS_PAYLOAD_SCHEMA_VERSION = 1;

export type RunscriptRow = { name: string; schedules: number; open: boolean };

export type ScriptsPayload = { rows: RunscriptRow[] };

export type NameIntent = { name: string };

export type CreateIntent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRunscriptRow(value: unknown): value is RunscriptRow {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.schedules === 'number'
    && typeof value.open === 'boolean';
}

export function isScriptsPayload(value: unknown): value is ScriptsPayload {
  return isRecord(value)
    && Array.isArray(value.rows)
    && value.rows.every((row) => isRunscriptRow(row));
}

export function isNameIntent(value: unknown): value is NameIntent {
  return isRecord(value) && typeof value.name === 'string';
}

export function isCreateIntent(value: unknown): value is CreateIntent {
  return isRecord(value);
}
