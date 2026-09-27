import { describe, expect, it } from 'vitest';
import { instantOf, isIsoDate } from './dates.js';

// The whole point of this module is that a date is a statement about the calendar and not about the
// shape of some text, so the cases that matter are the ones `Date.parse` gets wrong or gets right by
// accident.

describe('isIsoDate', () => {
  it('accepts a date and a date-time in ISO 8601', () => {
    expect(isIsoDate('2026-01-31')).toBe(true);
    expect(isIsoDate('2026-01-31T09:00')).toBe(true);
    expect(isIsoDate('2026-01-31 09:00')).toBe(true);
    expect(isIsoDate('2026-01-31T09:00:30')).toBe(true);
    expect(isIsoDate('2026-01-31T09:00:30Z')).toBe(true);
    expect(isIsoDate('2026-01-31T09:00:30+02:00')).toBe(true);
    expect(isIsoDate('2026-01-31T09:00:30.123Z')).toBe(true);
    expect(isIsoDate('  2026-01-31  ')).toBe(true);
  });

  it('refuses a format a reader could read two ways', () => {
    expect(isIsoDate('2026-1-31')).toBe(false);
    expect(isIsoDate('01/31/2026')).toBe(false);
    expect(isIsoDate('31 January 2026')).toBe(false);
    expect(isIsoDate('Jan 31, 2026')).toBe(false);
  });

  // Every one of these parses to a real instant under `Date.parse`, which is the trap: left unchecked,
  // a column of them would be typed as a date and charted at the instant it rolled over to.
  it('refuses a day the calendar does not have, which `Date.parse` would roll over', () => {
    expect(Date.parse('2026-02-31')).not.toBeNaN();
    expect(isIsoDate('2026-02-31')).toBe(false);
    expect(Date.parse('2023-02-29')).not.toBeNaN();
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(Date.parse('2026-00-10')).toBeNaN();
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(isIsoDate('2026-01-00')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });

  it('knows which years have a 29th of February', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('1900-02-29')).toBe(false);
  });

  it('refuses a time field out of range', () => {
    expect(isIsoDate('2026-01-31T24:00:00Z')).toBe(false);
    expect(isIsoDate('2026-01-31T09:60:00Z')).toBe(false);
    expect(isIsoDate('2026-01-31T09:00:60Z')).toBe(false);
    expect(isIsoDate('2026-01-31T23:59:59Z')).toBe(true);
  });

  it('refuses anything that is not a string, including a number and a boolean', () => {
    expect(isIsoDate(20_260_131)).toBe(false);
    expect(isIsoDate(true)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate('2026-01-31T09:00:30Zextra')).toBe(false);
  });
});

describe('instantOf', () => {
  // The client never re-checks the calendar — the server decided the column was a date — so this is a
  // plain read, and the test is that it agrees with the engine on what the server accepted.
  it('reads back what the server was willing to call a date', () => {
    expect(instantOf('2026-01-31')).toBe(Date.parse('2026-01-31'));
    expect(instantOf('2026-01-31T09:00:30Z')).toBe(Date.parse('2026-01-31T09:00:30Z'));
    expect(instantOf('  2026-01-31T09:00:30Z  ')).toBe(Date.parse('2026-01-31T09:00:30Z'));
  });

  it('orders two instants as the dates they name', () => {
    expect(instantOf('2026-01-31')).toBeLessThan(instantOf('2026-02-01'));
  });
});
