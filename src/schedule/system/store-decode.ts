import { isRunscriptName } from './runscript.js';
import type { StoreLoadResult, SystemScheduleEntry, SystemScheduleSnapshot } from './types.js';
import { isRecord } from '../../value-guards.js';
import { isValidRecurrence } from '../validity.js';

function validEntry(value: unknown): value is SystemScheduleEntry {
  if (!isRecord(value)) return false;
  if (['key', 'id', 'command', 'spec', 'script'].some((field) => typeof value[field] !== 'string' || value[field] === '')) return false;
  if (!Number.isFinite(value.nextRun) || typeof value.recurring !== 'boolean') return false;
  if (!isRunscriptName(value.script as string) || value.command !== `script ${value.script}`) return false;
  return isValidRecurrence(value);
}

export function decodeSystemScheduleSnapshot(value: unknown): StoreLoadResult {
  if (!isRecord(value) || !Number.isSafeInteger(value.version)) {
    return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule store') };
  }
  if (value.version !== 1) return { ok: false, kind: 'unsupported-version', version: value.version as number };
  if (!Array.isArray(value.entries)) return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule entries') };
  const entries = value.entries;
  if (!entries.every(validEntry) || new Set(entries.map((entry) => entry.key)).size !== entries.length) {
    return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule entry') };
  }
  return { ok: true, snapshot: { version: 1, entries } satisfies SystemScheduleSnapshot };
}
