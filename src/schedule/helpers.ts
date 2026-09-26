import type { ScheduleBodyResult, TimeOfDay } from './types.js';
import { MONTHS, parseMonthDay, parseTimeOfDay } from './parsing.js';
import { nextDateTime, nextOccurrenceOfTime } from './time.js';
import { fmtTime } from './display.js';

export function parseAtSchedule(tokens: string[], now: Date): ScheduleBodyResult {
  const tod = parseTimeOfDay(tokens[1] ?? '');
  if (!tod) return { error: `Invalid time: "${tokens[1] ?? ''}".` };
  const command = tokens.slice(2).join(' ').trim();
  if (!command) return { error: 'No command to schedule.' };
  return { action: 'add', entry: {
    command, spec: `at ${fmtTime(tod)}`, recurring: false,
    nextRun: nextOccurrenceOfTime(tod.hour, tod.minute, now),
  } };
}

export function parseOnSchedule(tokens: string[], now: Date): ScheduleBodyResult {
  const md = parseMonthDay(tokens.slice(1));
  if (!md) return { error: 'Invalid date. Try "on august 12th" or "on 8/12".' };
  let index = 1 + md.consumed;
  let tod: TimeOfDay = { hour: 9, minute: 0 };
  if (tokens[index]?.toLowerCase() === 'at') {
    const t = parseTimeOfDay(tokens[index + 1] ?? '');
    if (!t) return { error: `Invalid time: "${tokens[index + 1] ?? ''}".` };
    tod = t;
    index += 2;
  }
  const command = tokens.slice(index).join(' ').trim();
  if (!command) return { error: 'No command to schedule.' };
  return { action: 'add', entry: {
    command, spec: `on ${MONTHS[md.month].slice(0, 3)} ${md.day} at ${fmtTime(tod)}`, recurring: false,
    nextRun: nextDateTime(md.month, md.day, tod.hour, tod.minute, now),
  } };
}
