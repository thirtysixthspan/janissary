import type { PluginIntentReply, PluginIntentRequest, PluginTabEnvelope } from '../protocol.js';

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isJsonCompatible(value: unknown): boolean {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current === 'string' || typeof current === 'boolean') continue;
    if (typeof current === 'number' && Number.isFinite(current)) continue;
    if (Array.isArray(current)) {
      if (seen.has(current)) return false;
      seen.add(current);
      pending.push(...current);
      continue;
    }
    if (!isRecord(current) || seen.has(current)) return false;
    seen.add(current);
    pending.push(...Object.values(current));
  }
  return true;
}

export function isPluginTabEnvelope(value: unknown): value is PluginTabEnvelope {
  return isRecord(value)
    && typeof value.pluginId === 'string'
    && isPositiveInteger(value.schemaVersion)
    && isJsonCompatible(value.payload);
}

export function isPluginIntentRequest(value: unknown): value is PluginIntentRequest {
  return isRecord(value)
    && typeof value.tab === 'string'
    && value.tab.length > 0
    && isPositiveInteger(value.schemaVersion)
    && typeof value.intent === 'string'
    && value.intent.length > 0
    && isJsonCompatible(value.payload);
}

export function isPluginIntentReply(value: unknown): value is PluginIntentReply {
  return isRecord(value)
    && isPositiveInteger(value.schemaVersion)
    && isJsonCompatible(value.payload);
}
