import type { TimeOfDay } from './types.js';
import { isRecord } from '../value-guards.js';

export function isValidClock(value: unknown): value is TimeOfDay {
  if (!isRecord(value)) return false;
  const { hour, minute } = value;
  if (typeof hour !== 'number' || typeof minute !== 'number') return false;
  return Number.isSafeInteger(hour) && hour >= 0 && hour <= 23
    && Number.isSafeInteger(minute) && minute >= 0 && minute <= 59;
}

export function isValidIntervalMs(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isValidWeekday(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 6;
}

export function isValidRecurrence(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.recurring !== 'boolean') return false;
  if (!value.recurring) {
    return value.intervalMs === undefined && value.timeOfDay === undefined && value.weekday === undefined;
  }
  if (value.intervalMs !== undefined) {
    return isValidIntervalMs(value.intervalMs)
      && value.timeOfDay === undefined && value.weekday === undefined;
  }
  return isValidClock(value.timeOfDay)
    && (value.weekday === undefined || isValidWeekday(value.weekday));
}
