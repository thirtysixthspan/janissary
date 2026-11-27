import { isRunscriptName } from './runscript.js';
import type { StoreLoadResult, SystemScheduleEntry, SystemScheduleSnapshot } from './types.js';
import { isRecord } from '../../value-guards.js';
import { isValidRecurrence } from '../validity.js';

function isSupportedVersion(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

function validEntry(value: unknown, version: 1 | 2): value is SystemScheduleEntry {
  if (!isRecord(value)) return false;
  if (['key', 'id', 'command', 'spec', 'script'].some((field) => typeof value[field] !== 'string' || value[field] === '')) return false;
  if (!Number.isFinite(value.nextRun) || typeof value.recurring !== 'boolean') return false;
  if (!isRunscriptName(value.script as string) || value.command !== `script ${value.script}`) return false;
  if (!isValidRecurrence(value)) return false;
  if (version === 1) return !('paused' in value);
  return !('paused' in value) || (value.paused === true && value.recurring);
}

export function decodeSystemScheduleSnapshot(value: unknown): StoreLoadResult {
  if (!isRecord(value) || !Number.isSafeInteger(value.version)) {
    return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule store') };
  }
  const version = value.version;
  if (!isSupportedVersion(version)) return { ok: false, kind: 'unsupported-version', version: version as number };
  if (!Array.isArray(value.entries)) return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule entries') };
  const entries = value.entries;
  const isValid = (entry: unknown): entry is SystemScheduleEntry => validEntry(entry, version);
  if (!entries.every(isValid) || new Set(entries.map((entry) => entry.key)).size !== entries.length) {
    return { ok: false, kind: 'invalid', error: new Error('Invalid system schedule entry') };
  }
  return { ok: true, snapshot: { version, entries } satisfies SystemScheduleSnapshot };
}
