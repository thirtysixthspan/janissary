import { randomUUID } from 'node:crypto';
import { nextFutureRun } from '../time.js';
import type { SystemScheduleEntry } from './types.js';

export type SystemScheduleInput = Omit<SystemScheduleEntry, 'key'>;

export function createSystemSchedule(input: SystemScheduleInput): SystemScheduleEntry {
  return { ...input, key: randomUUID() };
}

export function cancelSystemScheduleByName(entries: SystemScheduleEntry[], name: string): SystemScheduleEntry[] {
  return entries.filter((entry) => entry.id !== name);
}

export function cancelSystemScheduleByKey(entries: SystemScheduleEntry[], key: string): SystemScheduleEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

export function pauseSystemScheduleByKey(entries: SystemScheduleEntry[], key: string): SystemScheduleEntry[] {
  return pauseMatching(entries, (entry) => entry.key === key);
}

export function pauseSystemScheduleByName(entries: SystemScheduleEntry[], name: string): SystemScheduleEntry[] {
  return pauseMatching(entries, (entry) => entry.id === name);
}

export function resumeSystemScheduleByKey(entries: SystemScheduleEntry[], key: string): SystemScheduleEntry[] {
  return resumeMatching(entries, (entry) => entry.key === key, new Date());
}

export function resumeSystemScheduleByName(entries: SystemScheduleEntry[], name: string): SystemScheduleEntry[] {
  return resumeMatching(entries, (entry) => entry.id === name, new Date());
}

function pauseMatching(
  entries: SystemScheduleEntry[],
  matches: (entry: SystemScheduleEntry) => boolean,
): SystemScheduleEntry[] {
  let changed = false;
  const next = entries.map((entry): SystemScheduleEntry => {
    if (!matches(entry) || !entry.recurring || entry.paused) return entry;
    changed = true;
    return { ...entry, paused: true };
  });
  return changed ? next : entries;
}

function resumeMatching(
  entries: SystemScheduleEntry[],
  matches: (entry: SystemScheduleEntry) => boolean,
  now: Date,
): SystemScheduleEntry[] {
  let changed = false;
  const next = entries.map((entry): SystemScheduleEntry => {
    if (!matches(entry) || !entry.paused) return entry;
    changed = true;
    const resumed: SystemScheduleEntry = { ...entry, nextRun: nextFutureRun(entry, now) };
    delete resumed.paused;
    return resumed;
  });
  return changed ? next : entries;
}
