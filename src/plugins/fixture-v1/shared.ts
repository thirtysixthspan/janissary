export const FIXTURE_PAYLOAD_SCHEMA_VERSION = 1;

export type FixturePayload = { text: string; resource: string };
export type FixtureIntentPayload = { value: string };
export type FixtureIntentResult = { echoed: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFixturePayload(value: unknown): value is FixturePayload {
  return isRecord(value)
    && typeof value.text === 'string'
    && typeof value.resource === 'string';
}

export function isFixtureIntentPayload(value: unknown): value is FixtureIntentPayload {
  return isRecord(value) && typeof value.value === 'string';
}
