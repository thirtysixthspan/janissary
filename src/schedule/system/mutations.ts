import { randomUUID } from 'node:crypto';
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
