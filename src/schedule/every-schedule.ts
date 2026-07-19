import type { TimeOfDay } from '../types.js';
import type { ScheduleBodyResult } from './helpers.js';

// `every <interval|day> [at TIME]` parsing, split out of helpers.ts: the largest and most
// branchy of the three schedule-body parsers, as opposed to the `at`/`on` forms that remain.

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SCHEDULE_USAGE = 'Usage: schedule NAME <at TIME | on DATE [at TIME] | every N(m|h|d|w) | every DAY at TIME> COMMAND | schedule list | schedule cancel <name> | schedule clear';

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
