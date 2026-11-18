import { describe, expect, it } from 'vitest';
import { isValidClock, isValidIntervalMs, isValidRecurrence, isValidWeekday } from './validity.js';

describe('isValidClock', () => {
  it('accepts safe integer hours and minutes in range', () => {
    expect(isValidClock({ hour: 0, minute: 0 })).toBe(true);
    expect(isValidClock({ hour: 23, minute: 59 })).toBe(true);
  });

  it('rejects out-of-range, fractional and wrongly typed values', () => {
    expect(isValidClock({ hour: 24, minute: 0 })).toBe(false);
    expect(isValidClock({ hour: -1, minute: 0 })).toBe(false);
    expect(isValidClock({ hour: 8, minute: 60 })).toBe(false);
    expect(isValidClock({ hour: 8.5, minute: 0 })).toBe(false);
    expect(isValidClock({ hour: '8', minute: 0 })).toBe(false);
  });

  it('rejects non-objects and missing fields', () => {
    expect(isValidClock(undefined)).toBe(false);
    expect(isValidClock(null)).toBe(false);
    expect(isValidClock({ hour: 8 })).toBe(false);
  });
});

describe('isValidIntervalMs', () => {
  it('accepts finite positive numbers', () => {
    expect(isValidIntervalMs(60_000)).toBe(true);
    expect(isValidIntervalMs(1)).toBe(true);
  });

  it('rejects zero, negative, non-finite and string values', () => {
    expect(isValidIntervalMs(0)).toBe(false);
    expect(isValidIntervalMs(-1)).toBe(false);
    expect(isValidIntervalMs(Infinity)).toBe(false);
    expect(isValidIntervalMs(NaN)).toBe(false);
    expect(isValidIntervalMs('60000')).toBe(false);
  });
});

describe('isValidWeekday', () => {
  it('accepts safe integer weekdays 0 through 6', () => {
    expect(isValidWeekday(0)).toBe(true);
    expect(isValidWeekday(6)).toBe(true);
  });

  it('rejects out-of-range, fractional and string values', () => {
    expect(isValidWeekday(-1)).toBe(false);
    expect(isValidWeekday(7)).toBe(false);
    expect(isValidWeekday(1.5)).toBe(false);
    expect(isValidWeekday('1')).toBe(false);
  });
});

describe('isValidRecurrence', () => {
  it('accepts a non-recurring value with no recurrence fields', () => {
    expect(isValidRecurrence({ recurring: false })).toBe(true);
  });

  it('rejects a non-recurring value carrying recurrence fields', () => {
    expect(isValidRecurrence({ recurring: false, intervalMs: 60_000 })).toBe(false);
    expect(isValidRecurrence({ recurring: false, timeOfDay: { hour: 8, minute: 0 } })).toBe(false);
    expect(isValidRecurrence({ recurring: false, weekday: 1 })).toBe(false);
  });

  it('accepts a positive interval on its own', () => {
    expect(isValidRecurrence({ recurring: true, intervalMs: 60_000 })).toBe(true);
  });

  it('accepts a clock time with and without a weekday', () => {
    expect(isValidRecurrence({ recurring: true, timeOfDay: { hour: 8, minute: 0 } })).toBe(true);
    expect(isValidRecurrence({ recurring: true, timeOfDay: { hour: 8, minute: 0 }, weekday: 1 })).toBe(true);
  });

  it('rejects conflicting recurrence fields', () => {
    expect(isValidRecurrence({ recurring: true, intervalMs: 60_000, timeOfDay: { hour: 8, minute: 0 } })).toBe(false);
    expect(isValidRecurrence({ recurring: true, intervalMs: 60_000, weekday: 1 })).toBe(false);
    expect(isValidRecurrence({ recurring: true, timeOfDay: { hour: 8, minute: 0 }, intervalMs: 60_000 })).toBe(false);
  });

  it('rejects an invalid clock or weekday', () => {
    expect(isValidRecurrence({ recurring: true, timeOfDay: { hour: 8, minute: 60 } })).toBe(false);
    expect(isValidRecurrence({ recurring: true, timeOfDay: { hour: 8, minute: 0 }, weekday: 7 })).toBe(false);
  });

  it('rejects non-objects and missing or non-boolean recurring', () => {
    expect(isValidRecurrence(undefined)).toBe(false);
    expect(isValidRecurrence({})).toBe(false);
    expect(isValidRecurrence({ recurring: 'true' })).toBe(false);
  });
});
