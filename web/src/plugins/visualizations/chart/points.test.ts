import { describe, expect, it } from 'vitest';
import {
  extentOf, marksFor, numeric, scatterFor, SINGLE_SERIES,
  type ChartShape, type Table,
} from './points';

const TABLE: Table = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'year', type: 'number' },
  ],
  rows: [
    ['north', 10, 2024],
    ['south', 4, 2025],
    ['north', 6, 2025],
  ],
};

function chart(over: Partial<ChartShape> = {}): ChartShape {
  return { kind: 'bar', x: 'region', y: 'revenue', title: 'Revenue', ...over };
}

describe('numeric', () => {
  it('reads a number, and a string holding one, which is what a CSV read produces', () => {
    expect(numeric(10)).toBe(10);
    expect(numeric('4.5')).toBe(4.5);
    expect(numeric(' 7 ')).toBe(7);
  });

  it('refuses a value that is not a number rather than guessing at it', () => {
    expect(numeric('north')).toBeUndefined();
    expect(numeric('')).toBeUndefined();
    expect(numeric(null)).toBeUndefined();
    expect(numeric(undefined)).toBeUndefined();
    expect(numeric(NaN)).toBeUndefined();
    expect(numeric(Infinity)).toBeUndefined();
  });
});

describe('marksFor', () => {
  it('produces one mark per row, banded in row order', () => {
    const marks = marksFor(TABLE, chart());
    expect(marks.points).toEqual([
      { band: 0, value: 10, series: SINGLE_SERIES, label: 'north' },
      { band: 1, value: 4, series: SINGLE_SERIES, label: 'south' },
      { band: 2, value: 6, series: SINGLE_SERIES, label: 'north' },
    ]);
    expect(marks.series).toEqual([SINGLE_SERIES]);
  });

  it('splits the marks by a series column, in first-seen order', () => {
    const marks = marksFor(TABLE, chart({ series: 'region' }));
    expect(marks.series).toEqual(['north', 'south']);
    expect(marks.points.map((point) => point.series)).toEqual(['north', 'south', 'north']);
  });

  // A measure that is not a number is dropped here so that no component has to decide what to do with
  // one, which is what keeps a chart of a partly-textual column from being full of zeroes.
  it('drops a row whose measure is not a number, rather than plotting a zero for it', () => {
    const mixed: Table = {
      columns: [{ name: 'a', type: 'string' }, { name: 'b', type: 'number' }],
      rows: [['x', 1], ['y', 'n/a'], ['z', 3]],
    };
    expect(marksFor(mixed, chart({ x: 'a', y: 'b' })).points.map((point) => point.band)).toEqual([0, 2]);
  });

  it('aggregates a pie into one slice per category, summing the measure', () => {
    const marks = marksFor(TABLE, chart({ kind: 'pie' }));
    expect(marks.slices).toEqual([{ label: 'north', value: 16 }, { label: 'south', value: 4 }]);
    expect(marks.series).toEqual([]);
  });

  it('produces nothing when a column is not in the table', () => {
    expect(marksFor(TABLE, chart({ x: 'missing' })).points).toEqual([]);
    expect(marksFor(TABLE, chart({ y: 'missing' })).points).toEqual([]);
    expect(marksFor(TABLE, chart({ series: 'missing' })).points).toEqual([]);
  });

  it('produces nothing for an empty table', () => {
    expect(marksFor({ columns: TABLE.columns, rows: [] }, chart()).points).toEqual([]);
  });
});

describe('scatterFor', () => {
  it('reads both axes as numbers, and drops a row where either is not', () => {
    expect(scatterFor(TABLE, chart({ kind: 'scatter', x: 'year', y: 'revenue' })))
      .toEqual([{ x: 2024, y: 10 }, { x: 2025, y: 4 }, { x: 2025, y: 6 }]);
  });

  it('produces nothing when an x column holds text', () => {
    expect(scatterFor(TABLE, chart({ kind: 'scatter' }))).toEqual([]);
  });
});

describe('extentOf', () => {
  it('spans the values', () => {
    expect(extentOf([3, 1, 7])).toEqual({ min: 1, max: 7 });
  });

  // A measure that never varies still needs a range, or every division downstream divides by zero.
  it('widens a range of one value, and answers for no values at all', () => {
    expect(extentOf([5, 5])).toEqual({ min: 4, max: 6 });
    expect(extentOf([])).toEqual({ min: 0, max: 1 });
  });

  it('keeps a negative span intact', () => {
    expect(extentOf([-4, -1])).toEqual({ min: -4, max: -1 });
  });
});
