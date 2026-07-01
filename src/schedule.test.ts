import { describe, it, expect } from 'vitest';
import {
  parseTimeOfDay,
  parseInterval,
  parseMonthDay,
  nextOccurrenceOfTime,
  nextWeekday,
  computeNextRun,
  parseScheduleCommand,
  formatSchedule,
} from './schedule.js';
import type { ScheduleEntry } from './types.js';

// Tuesday, June 23 2026, 2:00pm local.
const NOW = new Date(2026, 5, 23, 14, 0, 0, 0);

describe('parseTimeOfDay', () => {
  it('parses 12-hour times', () => {
    expect(parseTimeOfDay('3:35pm')).toEqual({ hour: 15, minute: 35 });
    expect(parseTimeOfDay('2pm')).toEqual({ hour: 14, minute: 0 });
    expect(parseTimeOfDay('3PM')).toEqual({ hour: 15, minute: 0 });
    expect(parseTimeOfDay('12am')).toEqual({ hour: 0, minute: 0 });
    expect(parseTimeOfDay('12pm')).toEqual({ hour: 12, minute: 0 });
  });

  it('parses 24-hour times', () => {
    expect(parseTimeOfDay('14:00')).toEqual({ hour: 14, minute: 0 });
    expect(parseTimeOfDay('9')).toEqual({ hour: 9, minute: 0 });
  });

  it('rejects invalid times', () => {
    expect(parseTimeOfDay('abc')).toBeUndefined();
    expect(parseTimeOfDay('25:00')).toBeUndefined();
    expect(parseTimeOfDay('13pm')).toBeUndefined();
    expect(parseTimeOfDay('3:99')).toBeUndefined();
  });
});

describe('parseInterval', () => {
  it('parses units to milliseconds', () => {
    expect(parseInterval('5m')).toBe(5 * 60_000);
    expect(parseInterval('2h')).toBe(2 * 3_600_000);
    expect(parseInterval('1d')).toBe(86_400_000);
    expect(parseInterval('1w')).toBe(604_800_000);
  });

  it('rejects invalid intervals', () => {
    expect(parseInterval('0m')).toBeUndefined();
    expect(parseInterval('5x')).toBeUndefined();
    expect(parseInterval('m')).toBeUndefined();
  });
});

describe('parseMonthDay', () => {
  it('parses month names with ordinal days', () => {
    expect(parseMonthDay(['august', '12th'])).toEqual({ month: 7, day: 12, consumed: 2 });
    expect(parseMonthDay(['aug', '12'])).toEqual({ month: 7, day: 12, consumed: 2 });
  });

  it('parses numeric dates', () => {
    expect(parseMonthDay(['8/12'])).toEqual({ month: 7, day: 12, consumed: 1 });
  });

  it('rejects invalid dates', () => {
    expect(parseMonthDay(['notamonth', '12'])).toBeUndefined();
    expect(parseMonthDay(['august', 'x'])).toBeUndefined();
    expect(parseMonthDay(['13/40'])).toBeUndefined();
  });
});

describe('next-run math', () => {
  it('returns today when the time is still ahead, tomorrow otherwise', () => {
    const later = nextOccurrenceOfTime(15, 0, NOW); // 3pm > 2pm
    expect(new Date(later).getDate()).toBe(23);
    const earlier = nextOccurrenceOfTime(13, 0, NOW); // 1pm < 2pm
    expect(new Date(earlier).getDate()).toBe(24);
  });

  it('finds the next matching weekday', () => {
    const d = new Date(nextWeekday(1, 9, 0, NOW)); // next Monday 9am (NOW is Tuesday)
    expect(d.getDay()).toBe(1);
    expect(d.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('computeNextRun advances intervals from now', () => {
    const entry = { intervalMs: 300_000, recurring: true } as ScheduleEntry;
    expect(computeNextRun(entry, NOW)).toBe(NOW.getTime() + 300_000);
  });

  it('computeNextRun rolls clock-time recurrences forward', () => {
    const entry = { timeOfDay: { hour: 13, minute: 0 }, recurring: true } as ScheduleEntry;
    expect(new Date(computeNextRun(entry, NOW)).getDate()).toBe(24);
  });
});

describe('parseScheduleCommand', () => {
  it('parses management subcommands', () => {
    expect(parseScheduleCommand('list', NOW)).toEqual({ action: 'list' });
    expect(parseScheduleCommand('clear', NOW)).toEqual({ action: 'clear' });
    expect(parseScheduleCommand('cancel s2', NOW)).toEqual({ action: 'cancel', id: 's2' });
    expect(parseScheduleCommand('cancel', NOW)).toHaveProperty('error');
  });

  it('parses one-shot times', () => {
    const r = parseScheduleCommand('t at 3:35pm echo hi', NOW);
    expect(r).toMatchObject({ action: 'add' });
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.entry).toMatchObject({ command: 'echo hi', spec: 'at 3:35pm', recurring: false });
    expect(r.entry.nextRun).toBe(new Date(2026, 5, 23, 15, 35, 0, 0).getTime());
  });

  it('parses one-shot dates with a default time', () => {
    const r = parseScheduleCommand('t on august 12th echo hi', NOW);
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.entry.spec).toBe('on aug 12 at 9:00am');
    expect(r.entry.recurring).toBe(false);
  });

  it('parses interval recurrences', () => {
    const r = parseScheduleCommand('t every 5m echo hi', NOW);
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.entry).toMatchObject({ command: 'echo hi', spec: 'every 5m', recurring: true, intervalMs: 300_000 });
    expect(r.entry.nextRun).toBe(NOW.getTime() + 300_000);
  });

  it('parses daily and weekday clock-time recurrences', () => {
    const daily = parseScheduleCommand('t every day at 9am echo hi', NOW);
    if (daily.action !== 'add') throw new Error('expected add');
    expect(daily.entry).toMatchObject({ spec: 'every day at 9:00am', recurring: true, timeOfDay: { hour: 9, minute: 0 } });
    expect(daily.entry.weekday).toBeUndefined();

    const monday = parseScheduleCommand('t every monday at 9am echo hi', NOW);
    if (monday.action !== 'add') throw new Error('expected add');
    expect(monday.entry).toMatchObject({ spec: 'every monday at 9:00am', weekday: 1 });
  });

  it('takes the first token as the timer name', () => {
    const r = parseScheduleCommand('deploy at 3pm npm run deploy', NOW);
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.name).toBe('deploy');
    expect(r.entry.command).toBe('npm run deploy');

    const fetch = parseScheduleCommand('fetch every 5m shell git fetch', NOW);
    if (fetch.action !== 'add') throw new Error('expected add');
    expect(fetch.name).toBe('fetch');
  });

  it('parses an `in <tab>` clause on add', () => {
    const r = parseScheduleCommand('standup in claude every day at 9am /standup', NOW);
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.name).toBe('standup');
    expect(r.target).toBe('claude');
    expect(r.entry).toMatchObject({ command: '/standup', spec: 'every day at 9:00am' });
  });

  it('parses an `in <tab>` clause on management subcommands', () => {
    expect(parseScheduleCommand('list in claude', NOW)).toEqual({ action: 'list', target: 'claude' });
    expect(parseScheduleCommand('clear in claude', NOW)).toEqual({ action: 'clear', target: 'claude' });
    expect(parseScheduleCommand('cancel s2 in claude', NOW)).toEqual({ action: 'cancel', id: 's2', target: 'claude' });
  });

  it('errors on a malformed `in` clause', () => {
    expect(parseScheduleCommand('standup in', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('list in', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('list in claude extra', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('cancel s2 in', NOW)).toHaveProperty('error');
  });

  it('leaves `in` inside the scheduled command untouched', () => {
    const r = parseScheduleCommand('t every 5m echo built in five', NOW);
    if (r.action !== 'add') throw new Error('expected add');
    expect(r.target).toBeUndefined();
    expect(r.entry.command).toBe('echo built in five');
  });

  it('errors when a named timer has no valid schedule form', () => {
    expect(parseScheduleCommand('deploy', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('deploy notawhen echo hi', NOW)).toHaveProperty('error');
  });

  it('reports errors for malformed input', () => {
    expect(parseScheduleCommand('', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('t every 5m', NOW)).toHaveProperty('error');
    expect(parseScheduleCommand('t at notatime echo', NOW)).toHaveProperty('error');
  });
});

describe('formatSchedule', () => {
  it('describes an empty schedule', () => {
    expect(formatSchedule([])).toBe('No scheduled commands.');
  });

  it('lists entries with id, spec and command', () => {
    const entries: ScheduleEntry[] = [
      { id: 's1', command: 'echo hi', spec: 'every 5m', nextRun: NOW.getTime(), recurring: true, intervalMs: 300_000 },
    ];
    const out = formatSchedule(entries);
    expect(out).toContain('s1');
    expect(out).toContain('every 5m');
    expect(out).toContain('echo hi');
  });
});
