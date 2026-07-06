import { describe, it, expect } from 'vitest';
import { parseAtSchedule, parseOnSchedule, parseEverySchedule } from './schedule-helpers.js';
import type { TimeOfDay } from './types.js';

const now = new Date('2026-07-06T12:00:00Z');

function validParseTimeOfDay(tok: string): TimeOfDay | undefined {
  if (tok === 'bad') return undefined;
  return { hour: 14, minute: 30 };
}

function validParseMonthDay(_tokens: string[]): { month: number; day: number; consumed: number } {
  return { month: 5, day: 15, consumed: 2 };
}

function badParseMonthDay(_tokens: string[]): { month: number; day: number; consumed: number } | undefined {
  return undefined;
}

function stubFmtTime(_t: TimeOfDay): string {
  return '2:30pm';
}

function stubNextOccurrenceOfTime(_h: number, _m: number, _n: Date): number {
  return 42;
}

function stubNextDateTime(_m: number, _d: number, _h: number, _mi: number, _n: Date): number {
  return 99;
}

function stubNextWeekday(_w: number, _h: number, _m: number, _n: Date): number {
  return 77;
}

function stubParseInterval(tok: string): number | undefined {
  if (tok === '5m') return 300_000;
  return undefined;
}

describe('parseAtSchedule', () => {
  it('returns an error when the time token is invalid', () => {
    const result = parseAtSchedule(['at', 'bad', 'ls'], now, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime);
    expect(result).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command is given after the time', () => {
    const result = parseAtSchedule(['at', '2pm', ''], now, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime);
    expect(result).toEqual({ error: 'No command to schedule.' });
  });

  it('returns a non-recurring schedule entry with the parsed time', () => {
    const result = parseAtSchedule(['at', '2pm', 'run', 'tests'], now, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'run tests', spec: 'at 2:30pm', recurring: false, nextRun: 42 },
    });
  });

});

describe('parseOnSchedule', () => {
  it('returns an error when the date is invalid', () => {
    const result = parseOnSchedule(['on', 'garbage'], now, badParseMonthDay, validParseTimeOfDay, stubFmtTime, stubNextDateTime);
    expect(result).toEqual({ error: 'Invalid date. Try "on august 12th" or "on 8/12".' });
  });

  it('returns an error when the time after "at" is invalid', () => {
    const result = parseOnSchedule(['on', 'aug', '12', 'at', 'bad', 'ls'], now, validParseMonthDay, validParseTimeOfDay, stubFmtTime, stubNextDateTime);
    expect(result).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command is given', () => {
    const result = parseOnSchedule(['on', 'aug', '12'], now, validParseMonthDay, validParseTimeOfDay, stubFmtTime, stubNextDateTime);
    expect(result).toEqual({ error: 'No command to schedule.' });
  });

  it('defaults to 9:00am when no "at" clause is provided', () => {
    const result = parseOnSchedule(['on', 'aug', '12', 'backup'], now, validParseMonthDay, validParseTimeOfDay, stubFmtTime, stubNextDateTime);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'backup', spec: 'on jun 15 at 2:30pm', recurring: false, nextRun: 99 },
    });
  });

  it('uses the explicit time when an "at" clause is present', () => {
    const result = parseOnSchedule(['on', 'aug', '12', 'at', '2pm', 'backup'], now, validParseMonthDay, validParseTimeOfDay, stubFmtTime, stubNextDateTime);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'backup', spec: 'on jun 15 at 2:30pm', recurring: false, nextRun: 99 },
    });
  });
});

describe('parseEverySchedule', () => {
  it('returns an interval schedule for a recognised interval token', () => {
    const result = parseEverySchedule(['every', '5m', 'check'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'check', spec: 'every 5m', recurring: true, intervalMs: 300_000, nextRun: now.getTime() + 300_000 },
    });
  });

  it('returns an error when no command follows an interval', () => {
    const result = parseEverySchedule(['every', '5m'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({ error: 'No command to schedule.' });
  });

  it('returns an error when the second token is neither an interval nor a valid day', () => {
    const result = parseEverySchedule(['every', 'zzz'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({ error: 'Invalid interval or day: "zzz".' });
  });

  it('returns an error when a weekday schedule is missing the "at" keyword', () => {
    const result = parseEverySchedule(['every', 'monday'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({ error: expect.stringContaining('Usage: schedule NAME') });
  });

  it('returns an error when the time in a weekday schedule is invalid', () => {
    const result = parseEverySchedule(['every', 'monday', 'at', 'bad', 'report'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({ error: 'Invalid time: "bad".' });
  });

  it('returns an error when no command follows a weekday schedule', () => {
    const result = parseEverySchedule(['every', 'monday', 'at', '2pm'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({ error: 'No command to schedule.' });
  });

  it('returns a recurring weekday schedule entry', () => {
    const result = parseEverySchedule(['every', 'monday', 'at', '2pm', 'report'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'report', spec: 'every monday at 2:30pm', recurring: true, timeOfDay: { hour: 14, minute: 30 }, weekday: 1, nextRun: 77 },
    });
  });

  it('returns a recurring "every day at" schedule entry', () => {
    const result = parseEverySchedule(['every', 'day', 'at', '2pm', 'report'], now, stubParseInterval, validParseTimeOfDay, stubFmtTime, stubNextOccurrenceOfTime, stubNextWeekday);
    expect(result).toEqual({
      action: 'add',
      entry: { command: 'report', spec: 'every day at 2:30pm', recurring: true, timeOfDay: { hour: 14, minute: 30 }, weekday: undefined, nextRun: 42 },
    });
  });
});
