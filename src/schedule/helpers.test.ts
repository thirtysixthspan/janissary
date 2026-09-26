import { describe, it, expect } from 'vitest';
import { parseAtSchedule, parseOnSchedule } from './helpers.js';
import { parseEverySchedule } from './every-schedule.js';
import { SCHEDULE_USAGE } from './usage.js';

// Tuesday, June 23 2026, 2:00pm local.
const now = new Date(2026, 5, 23, 14, 0, 0, 0);

function at(month: number, day: number, hour: number, minute = 0, year = 2026): number {
  return new Date(year, month, day, hour, minute, 0, 0).getTime();
}

describe('parseAtSchedule', () => {
  it('returns an error when the time token is invalid', () => {
    expect(parseAtSchedule(['at', 'bad', 'ls'], now)).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command is given after the time', () => {
    expect(parseAtSchedule(['at', '2pm'], now)).toEqual({ error: 'No command to schedule.' });
  });

  it('schedules a time still ahead for later today', () => {
    expect(parseAtSchedule(['at', '3pm', 'run', 'tests'], now)).toEqual({
      action: 'add',
      entry: { command: 'run tests', spec: 'at 3:00pm', recurring: false, nextRun: at(5, 23, 15) },
    });
  });

  it('schedules a time already past for tomorrow', () => {
    expect(parseAtSchedule(['at', '13:15', 'ls'], now)).toEqual({
      action: 'add',
      entry: { command: 'ls', spec: 'at 1:15pm', recurring: false, nextRun: at(5, 24, 13, 15) },
    });
  });
});

describe('parseOnSchedule', () => {
  it('returns an error when the date is invalid', () => {
    expect(parseOnSchedule(['on', 'garbage'], now)).toEqual({ error: 'Invalid date. Try "on august 12th" or "on 8/12".' });
  });

  it('returns an error when the time after "at" is invalid', () => {
    expect(parseOnSchedule(['on', 'aug', '12', 'at', 'bad', 'ls'], now)).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command is given', () => {
    expect(parseOnSchedule(['on', 'aug', '12'], now)).toEqual({ error: 'No command to schedule.' });
  });

  it('defaults to 9:00am when no "at" clause is provided', () => {
    expect(parseOnSchedule(['on', 'aug', '12', 'backup'], now)).toEqual({
      action: 'add',
      entry: { command: 'backup', spec: 'on aug 12 at 9:00am', recurring: false, nextRun: at(7, 12, 9) },
    });
  });

  it('uses the explicit time with a numeric date', () => {
    expect(parseOnSchedule(['on', '8/12', 'at', '2:30pm', 'backup'], now)).toEqual({
      action: 'add',
      entry: { command: 'backup', spec: 'on aug 12 at 2:30pm', recurring: false, nextRun: at(7, 12, 14, 30) },
    });
  });

  it('rolls a date already past this year over to next year', () => {
    expect(parseOnSchedule(['on', 'march', '3rd', 'report'], now)).toEqual({
      action: 'add',
      entry: { command: 'report', spec: 'on mar 3 at 9:00am', recurring: false, nextRun: at(2, 3, 9, 0, 2027) },
    });
  });
});

describe('parseEverySchedule', () => {
  it('returns an interval schedule for a recognised interval token', () => {
    expect(parseEverySchedule(['every', '5m', 'check'], now)).toEqual({
      action: 'add',
      entry: { command: 'check', spec: 'every 5m', recurring: true, intervalMs: 300_000, nextRun: now.getTime() + 300_000 },
    });
  });

  it('returns an error when no command follows an interval', () => {
    expect(parseEverySchedule(['every', '5m'], now)).toEqual({ error: 'No command to schedule.' });
  });

  it('returns an error when the second token is neither an interval nor a valid day', () => {
    expect(parseEverySchedule(['every', 'zzz'], now)).toEqual({ error: 'Invalid interval or day: "zzz".' });
  });

  it('returns the full usage when a weekday schedule is missing the "at" keyword', () => {
    expect(parseEverySchedule(['every', 'monday', 'report'], now)).toEqual({ error: SCHEDULE_USAGE });
  });

  it('returns the full usage, including the tab clauses, for "every day" without "at"', () => {
    const result = parseEverySchedule(['every', 'day', 'xyz', 'cmd'], now);
    expect(result).toEqual({ error: SCHEDULE_USAGE });
    expect(SCHEDULE_USAGE).toContain('schedule NAME [in TAB]');
    expect(SCHEDULE_USAGE).toContain('schedule list [in TAB]');
  });

  it('returns an error when the time in a weekday schedule is invalid', () => {
    expect(parseEverySchedule(['every', 'monday', 'at', 'bad', 'report'], now)).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command follows a weekday schedule', () => {
    expect(parseEverySchedule(['every', 'monday', 'at', '2pm'], now)).toEqual({ error: 'No command to schedule.' });
  });

  it('returns a recurring weekday schedule entry for the next matching weekday', () => {
    expect(parseEverySchedule(['every', 'monday', 'at', '2pm', 'report'], now)).toEqual({
      action: 'add',
      entry: { command: 'report', spec: 'every monday at 2:00pm', recurring: true, timeOfDay: { hour: 14, minute: 0 }, weekday: 1, nextRun: at(5, 29, 14) },
    });
  });

  it('returns a recurring "every day at" schedule entry for later today', () => {
    expect(parseEverySchedule(['every', 'day', 'at', '3pm', 'report'], now)).toEqual({
      action: 'add',
      entry: { command: 'report', spec: 'every day at 3:00pm', recurring: true, timeOfDay: { hour: 15, minute: 0 }, weekday: undefined, nextRun: at(5, 23, 15) },
    });
  });
});
