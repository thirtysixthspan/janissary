export const MODELS_PAYLOAD_SCHEMA_VERSION = 1;

export type ModelRow = { harness: string; id: string; name: string; disabled: boolean };
export type ModelGroup = { label: string; rows: ModelRow[] };
export type ModelsPayload = { groups: ModelGroup[]; refreshing: boolean };
export type DeleteIntent = { harness: string; id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModelRow(value: unknown): value is ModelRow {
  return isRecord(value)
    && typeof value.harness === 'string'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.disabled === 'boolean';
}

function isModelGroup(value: unknown): value is ModelGroup {
  return isRecord(value)
    && typeof value.label === 'string'
    && Array.isArray(value.rows)
    && value.rows.every(isModelRow);
}

export function isModelsPayload(value: unknown): value is ModelsPayload {
  return isRecord(value)
    && Array.isArray(value.groups)
    && value.groups.every(isModelGroup)
    && typeof value.refreshing === 'boolean';
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isDeleteIntent(value: unknown): value is DeleteIntent {
  return isRecord(value)
    && typeof value.harness === 'string' && value.harness.trim().length > 0
    && typeof value.id === 'string' && value.id.trim().length > 0;
}
