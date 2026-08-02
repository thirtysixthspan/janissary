export type FixtureV1Payload = { message: string; resource: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFixtureV1Payload(value: unknown): value is FixtureV1Payload {
  return isRecord(value) && typeof value.message === 'string' && typeof value.resource === 'string';
}

export function isFixtureV1Intent(intent: string, payload: unknown): boolean {
  return intent === 'echo' && isRecord(payload) && typeof payload.message === 'string';
}

export function isFixtureV1Reply(intent: string, payload: unknown): boolean {
  return intent === 'echo' && isRecord(payload) && typeof payload.message === 'string';
}
