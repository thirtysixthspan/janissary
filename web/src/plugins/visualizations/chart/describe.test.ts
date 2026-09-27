import { describe, expect, it } from 'vitest';
import { dataTableFor, describeChart } from './describe';
import type { ChartShape, Table } from './points';
// Every case here describes the chart the specification asked for. The transformations that narrow one
// are applied on the server and reach the browser as a table already narrowed, so there is no view to
// pass and nothing in this suite may reintroduce one.
const described = (table: Table, chart: ChartShape) => describeChart(table, chart);
const tabled = (table: Table, chart: ChartShape) => dataTableFor(table, chart);


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

describe('describeChart', () => {
  it('names the kind, the measure, its range, and both ends of it', () => {
    expect(described(TABLE, chart())).toBe(
      'A bar chart of revenue: 3 marks, from 4 at south to 10 at north.',
    );
  });

  // The first and last marks here share a category while the one between them does not, and naming one
  // category as though it were the whole range would describe the chart as narrower than it is.
  it('names no range when the first and last marks share a category', () => {
    expect(described(TABLE, chart())).not.toContain('over');
  });

  it('spans the categories when the first and last marks differ', () => {
    expect(described(TABLE, chart({ x: 'year', y: 'revenue' })))
      .toBe('A bar chart of revenue over 2024 to 2025: 3 marks, from 4 at 2025 to 10 at 2024.');
  });

  // A date axis's span is only meaningful because the marks are in chronological order, so this pins the
  // two together: order the axis, and the sentence reads the first date to the last.
  it('spans a date axis from its first date to its last', () => {
    const dates: Table = {
      columns: [{ name: 'day', type: 'date' }, { name: 'revenue', type: 'number' }],
      rows: [['2024-03-01', 7], ['2024-01-01', 3]],
    };
    expect(described(dates, chart({ x: 'day', y: 'revenue' })))
      .toBe('A bar chart of revenue over 2024-01-01 to 2024-03-01: 2 marks, from 3 at 2024-01-01 to 7 at 2024-03-01.');
  });

  // A specification can rename a measure for the reader, and the sentence has to use the name the
  // reader was given rather than the column it came from.
  it('uses the labels the specification gave rather than the column names', () => {
    expect(described(TABLE, chart({ yLabel: 'Revenue (USD)' }))).toContain('of Revenue (USD)');
  });

  it('describes a pie by its summed categories, largest first', () => {
    expect(described(TABLE, chart({ kind: 'pie' }))).toBe(
      'A pie chart of the sum of revenue over 2 categories: north is the largest at 16, south the smallest at 4.',
    );
  });

  // The reduction is the difference between a total and a raw value, so a sentence that left it out
  // would tell a reader the wrong number even though every figure in it is right.
  it('names the aggregate, so a total is never read as a raw value', () => {
    expect(described(TABLE, chart({ aggregate: 'mean' }))).toContain('of the mean of revenue');
    expect(described(TABLE, chart({ aggregate: 'count' }))).toContain('of the count of revenue');
    expect(described(TABLE, chart({ aggregate: 'min' }))).toContain('of the minimum of revenue');
    expect(described(TABLE, chart({ aggregate: 'max' }))).toContain('of the maximum of revenue');
    expect(described(TABLE, chart())).toBe('A bar chart of revenue: 3 marks, from 4 at south to 10 at north.');
  });

  // A pie sums whether or not the model said so, so an unlabelled pie is still described as a sum.
  it('describes a pie as a sum even when its specification names no aggregate', () => {
    expect(described(TABLE, chart({ kind: 'pie' }))).toContain('the sum of revenue');
  });

  it('describes a scatter by its two numeric columns', () => {
    expect(described(TABLE, chart({ kind: 'scatter', x: 'year' }))).toBe(
      'A scatter chart of revenue against year: 3 points, year from 2024 to 2025, revenue from 4 to 10.',
    );
  });

  // An empty chart is a real state — a measure that is not a number produces one — and a sentence built
  // from an empty range would read as though there were a maximum and a minimum of nothing.
  it('says a chart with no marks has nothing to plot', () => {
    expect(described({ columns: TABLE.columns, rows: [] }, chart()))
      .toBe('A bar chart of revenue with nothing to plot.');
    expect(described({ columns: TABLE.columns, rows: [] }, chart({ kind: 'pie' })))
      .toBe('A pie chart of the sum of revenue with nothing to plot.');
    expect(described({ columns: TABLE.columns, rows: [] }, chart({ kind: 'scatter' })))
      .toBe('A scatter chart of revenue against region with nothing to plot.');
  });

  it('does not call a fraction of a million a million', () => {
    const large: Table = {
      columns: [{ name: 'a', type: 'string' }, { name: 'b', type: 'number' }],
      rows: [['x', 1_234_567.891], ['y', 1.0005]],
    };
    expect(described(large, chart({ x: 'a', y: 'b' }))).toContain('from 1.001 at y to 1234567.891 at x');
  });
});

describe('dataTableFor', () => {
  it('lists the drawn marks, one row each, with the measure flagged numeric', () => {
    expect(tabled(TABLE, chart())).toEqual({
      columns: [
        { name: 'region', numeric: false },
        { name: 'revenue', numeric: true },
      ],
      rows: [['north', 10], ['south', 4], ['north', 6]],
    });
  });

  it('carries the series column only when the specification named one', () => {
    expect(tabled(TABLE, chart({ series: 'region' })).columns).toEqual([
      { name: 'region', numeric: false },
      { name: 'revenue', numeric: true },
      { name: 'region', numeric: false },
    ]);
    expect(tabled(TABLE, chart({ series: 'region' })).rows[0]).toEqual(['north', 10, 'north']);
  });

  it('lists a pie by its summed categories', () => {
    expect(tabled(TABLE, chart({ kind: 'pie' })).rows).toEqual([['north', 16], ['south', 4]]);
  });

  it('lists a scatter by its two numeric columns', () => {
    expect(tabled(TABLE, chart({ kind: 'scatter', x: 'year' })).columns).toEqual([
      { name: 'year', numeric: true },
      { name: 'revenue', numeric: true },
    ]);
    expect(tabled(TABLE, chart({ kind: 'scatter', x: 'year' })).rows[0]).toEqual([2024, 10]);
  });

  it('produces no rows for a chart with no marks', () => {
    expect(tabled({ columns: TABLE.columns, rows: [] }, chart()).rows).toEqual([]);
  });

  // A table is positional, so two columns of the same shape have to stay distinguishable by name —
  // otherwise a reader cannot tell which of the two numbers is which.
  it('keeps a column named like another distinguishable', () => {
    const doubled: Table = {
      columns: [{ name: 'value', type: 'string' }, { name: 'value ', type: 'number' }],
      rows: [['north', 3]],
    };
    const data = tabled(doubled, chart({ x: 'value', y: 'value ' }));
    expect(data.columns.map((column) => column.name)).toEqual(['value', 'value ']);
    expect(data.rows).toEqual([['north', 3]]);
  });
});
