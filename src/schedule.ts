// Parsing and next-run math for the `schedule` command. Pure (no I/O) so it is fully
// unit-testable; callers (the command + the scheduler tick) own the side effects.

import type { ScheduleEntry, TimeOfDay, ScheduleParseResult } from './types.js';

// The body parser produces an add result without a name; the wrapper attaches the leading
// positional name afterwards.
type ScheduleBodyResult = { action: 'add'; entry: Omit<ScheduleEntry, 'id'> } | { error: string };

export const SCHEDULE_USAGE =
  'Usage: schedule NAME <at TIME | on DATE [at TIME] | every N(m|h|d|w) | every DAY at TIME> COMMAND'
  + ' | schedule list | schedule cancel <name> | schedule clear';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

export function parseTimeOfDay(tok: string): TimeOfDay | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(tok.trim());
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap) {
    if (hour < 1 || hour > 12) return null;
    if (ap === 'pm' && hour !== 12) hour += 12;
    if (ap === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  if (minute > 59) return null;
  return { hour, minute };
}

export function parseInterval(tok: string): number | null {
  const m = /^(\d+)(m|h|d|w)$/i.exec(tok.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0) return null;
  return n * UNIT_MS[m[2].toLowerCase()];
}

export function parseMonthDay(tokens: string[]): { month: number; day: number; consumed: number } | null {
  const first = tokens[0];
  if (!first) return null;
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(first);
  if (slash) {
    const month = parseInt(slash[1], 10) - 1;
    const day = parseInt(slash[2], 10);
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { month, day, consumed: 1 };
  }
  const lc = first.toLowerCase();
  const month = lc.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(lc)) : -1;
  if (month < 0) return null;
  const dm = /^(\d{1,2})(?:st|nd|rd|th)?$/i.exec(tokens[1] ?? '');
  if (!dm) return null;
  const day = parseInt(dm[1], 10);
  if (day < 1 || day > 31) return null;
  return { month, day, consumed: 2 };
}

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
    const tod = parseTimeOfDay(tokens[1] ?? '');
    if (!tod) return { error: `Invalid time: "${tokens[1] ?? ''}".` };
    const command = tokens.slice(2).join(' ').trim();
    if (!command) return { error: 'No command to schedule.' };
    return { action: 'add', entry: {
      command, spec: `at ${fmtTime(tod)}`, recurring: false,
      nextRun: nextOccurrenceOfTime(tod.hour, tod.minute, now),
    } };
  }

  if (head === 'on') {
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

  if (head === 'every') {
    const second = tokens[1] ?? '';
    const interval = parseInterval(second);
    if (interval !== null) {
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

  return { error: SCHEDULE_USAGE };
}
