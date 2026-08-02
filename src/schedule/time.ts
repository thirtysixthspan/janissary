import type { ScheduleEntry } from './types.js';

export function nextOccurrenceOfTime(hour: number, minute: number, now: Date): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function nextWeekday(weekday: number, hour: number, minute: number, now: Date): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= now.getTime()) diff = 7;
  d.setDate(d.getDate() + diff);
  return d.getTime();
}

export function nextDateTime(month: number, day: number, hour: number, minute: number, now: Date): number {
  const year = now.getFullYear();
  const d = new Date(year, month, day, hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setFullYear(year + 1);
  return d.getTime();
}

export function computeNextRun(entry: ScheduleEntry, now: Date): number {
  if (entry.intervalMs) return now.getTime() + entry.intervalMs;
  if (entry.timeOfDay) {
    const { hour, minute } = entry.timeOfDay;
    return entry.weekday === undefined
      ? nextOccurrenceOfTime(hour, minute, now)
      : nextWeekday(entry.weekday, hour, minute, now);
  }
  return now.getTime();
}
