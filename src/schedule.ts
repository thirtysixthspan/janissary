// Parsing and next-run math for the `schedule` command. Pure (no I/O) so it is fully
// unit-testable; callers (the command + the scheduler tick) own the side effects.

import type { ScheduleEntry, TimeOfDay, ScheduleParseResult } from './types.js';
import { parseAtSchedule, parseOnSchedule, parseEverySchedule } from './schedule-helpers.js';
import {
  parseTimeOfDay, parseInterval, parseMonthDay, MONTHS,
} from './schedule-parsing.js';
export { parseTimeOfDay, parseInterval, parseMonthDay } from './schedule-parsing.js';

// The body parser produces an add result without a name; the wrapper attaches the leading
// positional name afterwards.
type ScheduleBodyResult = { action: 'add'; entry: Omit<ScheduleEntry, 'id'> } | { error: string };

export const SCHEDULE_USAGE =
  'Usage: schedule NAME <at TIME | on DATE [at TIME] | every N(m|h|d|w) | every DAY at TIME> COMMAND'
  + ' | schedule list | schedule cancel <name> | schedule clear';

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

function nextDateTime(month: number, day: number, hour: number, minute: number, now: Date): number {
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

function fmtTime({ hour, minute }: TimeOfDay): string {
  const ap = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')}${ap}`;
}

export function fmtNextRun(ts: number): string {
  const d = new Date(ts);
  const mon = MONTHS[d.getMonth()];
  const month = mon[0].toUpperCase() + mon.slice(1, 3);
  return `${month} ${d.getDate()} ${fmtTime({ hour: d.getHours(), minute: d.getMinutes() })}`;
}

export function formatSchedule(entries: ScheduleEntry[]): string {
  if (entries.length === 0) return 'No scheduled commands.';
  return entries
    .map((e) => `${e.id}  ${e.spec}  (next: ${fmtNextRun(e.nextRun)})  ${e.command}`)
    .join('\n');
}

export function parseScheduleCommand(rest: string, now: Date): ScheduleParseResult {
  const trimmed = rest.trim();
  if (!trimmed) return { error: SCHEDULE_USAGE };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0].toLowerCase();

  if (head === 'list') return { action: 'list' };
  if (head === 'clear') return { action: 'clear' };
  if (head === 'cancel') {
    if (!tokens[1]) return { error: 'Usage: schedule cancel <name>' };
    return { action: 'cancel', id: tokens[1] };
  }

  // Otherwise the first token names the timer (becoming its id, shown in the schedule window
  // and used by `schedule cancel <name>`); the remainder is the schedule form.
  const name = tokens[0];
  const body = parseScheduleBody(trimmed.slice(tokens[0].length).trim(), now);
  if ('error' in body) return body;
  return { ...body, name };
}

function parseScheduleBody(rest: string, now: Date): ScheduleBodyResult {
  const trimmed = rest.trim();
  if (!trimmed) return { error: SCHEDULE_USAGE };
  const tokens = trimmed.split(/\s+/);
  const head = tokens[0].toLowerCase();

  if (head === 'at') {
    return parseAtSchedule(tokens, now, parseTimeOfDay, fmtTime, nextOccurrenceOfTime);
  }

  if (head === 'on') {
    return parseOnSchedule(tokens, now, parseMonthDay, parseTimeOfDay, fmtTime, nextDateTime);
  }

  if (head === 'every') {
    return parseEverySchedule(tokens, now, parseInterval, parseTimeOfDay, fmtTime, nextOccurrenceOfTime, nextWeekday);
  }

  return { error: SCHEDULE_USAGE };
}
