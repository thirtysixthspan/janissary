import type { TabPluginActivation } from './api.js';

// The three checks a plugin-produced value has to pass, shared by the creation and update paths so a
// payload can never enter a tab through one route under weaker rules than the other. Split out of
// `context.ts` because they are pure and say nothing about the host: a title is checked only when
// there is one, since creation always supplies one and an update may leave it alone.

export function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatible(item, seen))
    : Object.values(value).every((item) => isJsonCompatible(item, seen));
  seen.delete(value);
  return valid;
}

function isSettingsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && isJsonCompatible(value);
}

export function validateTabValue(
  activation: TabPluginActivation,
  value: { title?: string; payload: unknown },
): void {
  if (value.title !== undefined && !value.title.trim()) throw new Error('produced an empty tab title');
  if (!activation.isPayload(value.payload) || !isJsonCompatible(value.payload)) {
    throw new Error('produced an invalid tab payload');
  }
}

// The settings a plugin may save are the same JSON the wire carries, so a stray `undefined` or a
// function never reaches the config file.
export function isPluginSettings(value: unknown): value is Record<string, unknown> {
  return isSettingsObject(value);
}
