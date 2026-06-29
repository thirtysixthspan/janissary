import type { ScheduleEntry, TimeOfDay } from './types.js';

export type ScheduleBodyResult = { action: 'add'; entry: Omit<ScheduleEntry, 'id'> } | { error: string };

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SCHEDULE_USAGE = 'Usage: schedule NAME <at TIME | on DATE [at TIME] | every N(m|h|d|w) | every DAY at TIME> COMMAND | schedule list | schedule cancel <name> | schedule clear';

export function parseAtSchedule(tokens: string[], now: Date, parseTimeOfDay: (tok: string) => TimeOfDay | undefined, fmtTime: (t: TimeOfDay) => string, nextOccurrenceOfTime: (h: number, m: number, n: Date) => number): ScheduleBodyResult {
  const tod = parseTimeOfDay(tokens[1] ?? '');
  if (!tod) return { error: `Invalid time: "${tokens[1] ?? ''}".` };
  const command = tokens.slice(2).join(' ').trim();
  if (!command) return { error: 'No command to schedule.' };
  return { action: 'add', entry: {
    command, spec: `at ${fmtTime(tod)}`, recurring: false,
    nextRun: nextOccurrenceOfTime(tod.hour, tod.minute, now),
  } };
}

export function parseOnSchedule(tokens: string[], now: Date, parseMonthDay: (t: string[]) => { month: number; day: number; consumed: number } | undefined, parseTimeOfDay: (tok: string) => TimeOfDay | undefined, fmtTime: (t: TimeOfDay) => string, nextDateTime: (m: number, d: number, h: number, mi: number, n: Date) => number): ScheduleBodyResult {
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

export function parseEverySchedule(tokens: string[], now: Date, parseInterval: (tok: string) => number | undefined, parseTimeOfDay: (tok: string) => TimeOfDay | undefined, fmtTime: (t: TimeOfDay) => string, nextOccurrenceOfTime: (h: number, m: number, n: Date) => number, nextWeekday: (w: number, h: number, m: number, n: Date) => number): ScheduleBodyResult {
  const second = tokens[1] ?? '';
  const interval = parseInterval(second);
  if (interval !== undefined) {
    const command = tokens.slice(2).join(' ').trim();
    if (!command) return { error: 'No command to schedule.' };
    return { action: 'add', entry: {
      command, spec: `every ${second.toLowerCase()}`, recurring: true,
      intervalMs: interval, nextRun: now.getTime() + interval,
    } };
  }
  const dayWord = second.toLowerCase();
  let weekday: number | undefined;
  if (dayWord !== 'day') {
    const wd = dayWord.length >= 3 ? WEEKDAYS.findIndex((w) => w.startsWith(dayWord)) : -1;
    if (wd < 0) return { error: `Invalid interval or day: "${second}".` };
    weekday = wd;
  }
  if (tokens[2]?.toLowerCase() !== 'at') return { error: SCHEDULE_USAGE };
  const tod = parseTimeOfDay(tokens[3] ?? '');
  if (!tod) return { error: `Invalid time: "${tokens[3] ?? ''}".` };
  const command = tokens.slice(4).join(' ').trim();
  if (!command) return { error: 'No command to schedule.' };
  const label = weekday === undefined ? 'day' : WEEKDAYS[weekday];
  return { action: 'add', entry: {
    command, spec: `every ${label} at ${fmtTime(tod)}`, recurring: true,
    timeOfDay: tod, weekday,
    nextRun: weekday === undefined
      ? nextOccurrenceOfTime(tod.hour, tod.minute, now)
      : nextWeekday(weekday, tod.hour, tod.minute, now),
  } };
}
