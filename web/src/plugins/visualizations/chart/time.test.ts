import { describe, expect, it } from 'vitest';
import { calendarLabel } from './time';

// The labels are the whole of a calendar axis: a month is a month, a year is a year, and the unit arrived
// with the chart because the host floored the cells to it. A label that disagreed with the bucketing
// would describe a span the data does not cover.

describe('calendarLabel', () => {
  it('says a year as a year', () => {
    expect(calendarLabel('2026-01-01', 'year')).toBe('2026');
  });

  it('says a month as a month, with the year on the first one', () => {
    // Twelve month names with no year on any of them is how a reader ends up unable to tell which year a
    // band is in, which is the one thing the labels have to carry.
    expect(calendarLabel('2026-01-01', 'month')).toBe('Jan 2026');
    expect(calendarLabel('2026-06-01', 'month')).toBe('Jun');
    expect(calendarLabel('2027-01-01', 'month')).toBe('Jan 2027');
  });

  it('says a quarter as the quarter it is', () => {
    expect(calendarLabel('2026-01-01', 'quarter')).toBe('Jan Q1');
    expect(calendarLabel('2026-08-01', 'quarter')).toBe('Aug Q3');
    expect(calendarLabel('2026-12-01', 'quarter')).toBe('Dec Q4');
  });

  it('says a day as a day, and a week by the day it began', () => {
    expect(calendarLabel('2026-03-17', 'day')).toBe('Mar 17');
    expect(calendarLabel('2026-03-16', 'week')).toBe('Mar 16');
  });

  it('leaves a value that is not a date exactly as it was', () => {
    expect(calendarLabel('north', 'month')).toBe('north');
    expect(calendarLabel('', 'month')).toBe('');
  });
});
