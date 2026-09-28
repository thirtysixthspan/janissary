import { describe, expect, it } from 'vitest';
import { bucketed, startOf, unitFor } from './time-units';
import type { Table } from './table';

// A date column the host has floored is the whole of what a time unit does, and the arithmetic of a
// calendar is exactly where an off-by-one becomes a chart that is wrong rather than a test that fails.

function days(first: string, count: number): Table {
  const rows = Array.from({ length: count }, (_, index) => {
    const at = new Date(`${first}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + index);
    return [at.toISOString().slice(0, 10), index];
  });
  return { columns: [{ name: 'day', type: 'date' }, { name: 'n', type: 'number' }], rows } as Table;
}

describe('startOf', () => {
  it('floors a date to the start of its month', () => {
    expect(startOf(Date.parse('2026-03-17T09:00:00Z'), 'month')).toBe('2026-03-01');
    expect(startOf(Date.parse('2026-03-31T23:59:59Z'), 'month')).toBe('2026-03-01');
  });

  it('floors to the start of its quarter, and a quarter is three months from January', () => {
    expect(startOf(Date.parse('2026-02-01T00:00:00Z'), 'quarter')).toBe('2026-01-01');
    expect(startOf(Date.parse('2026-05-19T00:00:00Z'), 'quarter')).toBe('2026-04-01');
    expect(startOf(Date.parse('2026-11-30T00:00:00Z'), 'quarter')).toBe('2026-10-01');
  });

  it('floors to the start of the ISO week, which is a Monday', () => {
    // 2026-03-17 is a Tuesday, so its week began on the fifteenth, and the fifteenth of March 2026 is a
    // Sunday — the case that a week starting on Sunday would get wrong.
    expect(startOf(Date.parse('2026-03-17T00:00:00Z'), 'week')).toBe('2026-03-16');
    expect(startOf(Date.parse('2026-03-16T00:00:00Z'), 'week')).toBe('2026-03-16');
    expect(startOf(Date.parse('2026-03-15T00:00:00Z'), 'week')).toBe('2026-03-09');
  });

  it('floors to the day, and to the year', () => {
    expect(startOf(Date.parse('2026-03-17T23:00:00Z'), 'day')).toBe('2026-03-17');
    expect(startOf(Date.parse('2026-03-17T00:00:00Z'), 'year')).toBe('2026-01-01');
  });

  it('crosses a year boundary the way the calendar does', () => {
    expect(startOf(Date.parse('2025-12-31T23:00:00Z'), 'month')).toBe('2025-12-01');
    expect(startOf(Date.parse('2026-01-01T00:00:00Z'), 'month')).toBe('2026-01-01');
    expect(startOf(Date.parse('2025-12-29T00:00:00Z'), 'week')).toBe('2025-12-29');
  });
});

describe('bucketed', () => {
  // The rows are all kept. A table whose rows were collapsed here would have the chart's own aggregate
  // applied to already-summed rows, which is right for a sum and wrong for a mean.
  it('keeps every row and rewrites only the x cells', () => {
    const source = days('2026-01-30', 4);
    const bucketedTable = bucketed(source, 'day', 'month');
    expect(bucketedTable.rows).toHaveLength(4);
    expect(bucketedTable.rows.map((row) => row[0])).toEqual(['2026-01-01', '2026-01-01', '2026-02-01', '2026-02-01']);
    expect(bucketedTable.rows.map((row) => row[1])).toEqual([0, 1, 2, 3]);
  });

  it('leaves a cell that is not a date exactly as it was', () => {
    const mixed = { columns: [{ name: 'day', type: 'date' }, { name: 'n', type: 'number' }], rows: [['not a date', 1], ['2026-03-02', 2]] } as unknown as Table;
    expect(bucketed(mixed, 'day', 'month').rows.map((row) => row[0])).toEqual(['not a date', '2026-03-01']);
  });

  it('is the identity on a table with no such column', () => {
    const source = days('2026-01-30', 2);
    expect(bucketed(source, 'nope', 'month')).toBe(source);
  });
});

describe('unitFor', () => {
  it('reads a short span as days and a long one as years', () => {
    expect(unitFor(40 * 86_400_000)).toBe('day');
    expect(unitFor(200 * 86_400_000)).toBe('month');
    expect(unitFor(900 * 86_400_000)).toBe('year');
  });
});
