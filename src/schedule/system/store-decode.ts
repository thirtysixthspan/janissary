import { isRunscriptName } from './runscript.js';
import type { StoreLoadResult, SystemScheduleEntry, SystemScheduleSnapshot } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNoRecurrenceFields(entry: Record<string, unknown>): boolean {
  return entry.intervalMs === undefined && entry.timeOfDay === undefined && entry.weekday === undefined;
}

function validClock(entry: Record<string, unknown>): boolean {
  const time = entry.timeOfDay;
  if (!isRecord(time) || !Number.isSafeInteger(time.hour) || !Number.isSafeInteger(time.minute)) return false;
  if ((time.hour as number) < 0 || (time.hour as number) > 23 || (time.minute as number) < 0 || (time.minute as number) > 59) return false;
  if (entry.intervalMs !== undefined) return false;
  return entry.weekday === undefined || (Number.isSafeInteger(entry.weekday) && (entry.weekday as number) >= 0 && (entry.weekday as number) <= 6);
}

function validEntry(value: unknown): value is SystemScheduleEntry {
  if (!isRecord(value)) return false;
  if (['key', 'id', 'command', 'spec', 'script'].some((field) => typeof value[field] !== 'string' || value[field] === '')) return false;
  if (!Number.isFinite(value.nextRun) || typeof value.recurring !== 'boolean') return false;
  if (!isRunscriptName(value.script as string) || value.command !== `script ${value.script}`) return false;
  if (!value.recurring) return hasNoRecurrenceFields(value);
  if (value.intervalMs !== undefined) return Number.isFinite(value.intervalMs) && (value.intervalMs as number) > 0 && value.timeOfDay === undefined && value.weekday === undefined;
  return validClock(value);
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
