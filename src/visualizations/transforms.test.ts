import { describe, it, expect } from 'vitest';
import { transformed, transformSummary } from './transforms.js';
import type { Cell, Table } from './table.js';
import type { VisualizationTransform } from '../protocol/visualizations.js';

function table(
  columns: { name: string; type: 'number' | 'string' | 'date' | 'boolean' }[],
  rows: Cell[][],
): Table {
  return { columns, rows };
}

const sales = table(
  [
    { name: 'region', type: 'string' },
    { name: 'year', type: 'number' },
    { name: 'revenue', type: 'number' },
  ],
  [
    ['north', 2023, 100],
    ['south', 2024, 300],
    ['north', 2024, 50],
    ['east', 2024, 200],
  ],
);

function run(steps: VisualizationTransform[], source: Table = sales, category = 'region') {
  return transformed(source, steps, category);
}

function rowsOf(result: ReturnType<typeof run>) {
  if ('error' in result) throw new Error(result.error);
  return result.table.rows;
}

describe('transformed', () => {
  it('keeps only the rows a filter matches', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'year', compare: 'eq', value: 2024 }]));
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row[1] === 2024)).toBe(true);
  });

  it('compares a number numerically rather than as text', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'revenue', compare: 'gt', value: 99 }]));
    expect(rows).toHaveLength(3);
  });

  it('negates a comparison', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'region', compare: 'ne', value: 'north' }]));
    expect(rows).toHaveLength(2);
  });

  it('compares a date as an instant', () => {
    const dated = table([{ name: 'day', type: 'date' }, { name: 'n', type: 'number' }], [
      ['2024-01-01', 1], ['2024-06-01', 2], ['2025-01-01', 3],
    ]);
    const rows = rowsOf(run([{ op: 'filter', column: 'day', compare: 'gte', value: '2024-06-01' }], dated, 'day'));
    expect(rows).toHaveLength(2);
  });

  it('compares a boolean against a boolean', () => {
    const flagged = table([{ name: 'ok', type: 'boolean' }, { name: 'n', type: 'number' }], [[true, 1], [false, 2]]);
    const rows = rowsOf(run([{ op: 'filter', column: 'ok', compare: 'eq', value: true }], flagged, 'n'));
    expect(rows).toHaveLength(1);
  });

  it('tests a substring', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'region', compare: 'contains', value: 'or' }]));
    expect(rows).toHaveLength(2);
  });

  it('keeps a row matching any of several values', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'region', compare: 'in', values: ['north', 'east'] }]));
    expect(rows).toHaveLength(3);
  });

  it('refuses a filter naming a column that is not there', () => {
    expect(run([{ op: 'filter', column: 'nope', compare: 'eq', value: 1 }]))
      .toEqual({ error: 'no column named "nope" to filter on' });
  });

  it('adds a derived column and leaves the others alone', () => {
    const result = run([{ op: 'derive', name: 'per region', expression: 'revenue / 10' }]);
    const rows = rowsOf(result);
    if ('error' in result) throw new Error(result.error);
    expect(result.table.columns.map((column) => column.name)).toEqual(['region', 'year', 'revenue', 'per region']);
    expect(result.table.columns[3]?.type).toBe('number');
    expect(rows[0]).toEqual(['north', 2023, 100, 10]);
  });

  it('refuses a derive over a name the table does not have', () => {
    const result = run([{ op: 'derive', name: 'x', expression: 'nope / 2' }]);
    expect(result).toEqual({ error: '"nope / 2" is not an expression over "region", "year", "revenue"' });
  });

  it('refuses a derive whose name is already taken', () => {
    expect(run([{ op: 'derive', name: 'revenue', expression: 'revenue / 2' }]))
      .toEqual({ error: 'there is already a column named "revenue"' });
  });

  it('sorts by a column, largest first, and keeps source order among equals', () => {
    const tied = table([{ name: 'n', type: 'number' }, { name: 'tag', type: 'string' }], [[1, 'a'], [1, 'b'], [2, 'c']]);
    const rows = rowsOf(run([{ op: 'sort', column: 'n', direction: 'desc' }], tied, 'tag'));
    expect(rows.map((row) => row[1])).toEqual(['c', 'a', 'b']);
  });

  it('refuses a sort naming a column that is not there', () => {
    expect(run([{ op: 'sort', column: 'nope', direction: 'asc' }]))
      .toEqual({ error: 'no column named "nope" to sort on' });
  });

  it('counts a limit in categories, so a split chart loses a whole one', () => {
    const split = table(
      [
        { name: 'region', type: 'string' },
        { name: 'quarter', type: 'string' },
        { name: 'revenue', type: 'number' },
      ],
      [
        ['north', 'q1', 10], ['north', 'q2', 10],
        ['south', 'q1', 5], ['south', 'q2', 5],
        ['east', 'q1', 1], ['east', 'q2', 1],
      ],
    );
    const steps: VisualizationTransform[] = [
      { op: 'sort', column: 'revenue', direction: 'desc' },
      { op: 'limit', count: 2 },
    ];
    const rows = rowsOf(run(steps, split));
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row[0]))).toEqual(new Set(['north', 'south']));
  });

  it('refuses a limit that is not a positive count', () => {
    expect(run([{ op: 'limit', count: 0 }])).toEqual({ error: '"0" is not a number of categories' });
  });

  it('refuses a limit counted against a column that is not there', () => {
    expect(run([{ op: 'limit', count: 2 }], sales, 'nope'))
      .toEqual({ error: 'no column named "nope" to count categories of' });
  });

  it('applies steps in order, so a sort then a limit is a top-N', () => {
    const steps: VisualizationTransform[] = [
      { op: 'sort', column: 'revenue', direction: 'desc' },
      { op: 'limit', count: 2 },
    ];
    const rows = rowsOf(run(steps));
    expect(rows.map((row) => row[0])).toEqual(['south', 'east']);
  });

  it('produces a table with no rows rather than failing when a filter keeps nothing', () => {
    const rows = rowsOf(run([{ op: 'filter', column: 'year', compare: 'eq', value: 1999 }]));
    expect(rows).toEqual([]);
  });

  it('applies no steps at all to an unchanged table', () => {
    expect(rowsOf(run([]))).toEqual(sales.rows);
  });
});

describe('transformSummary', () => {
  it('says what a filter kept', () => {
    expect(transformSummary({ op: 'filter', column: 'year', compare: 'eq', value: 2024 }))
      .toBe("only year eq '2024'");
  });

  it('says what a derive added', () => {
    expect(transformSummary({ op: 'derive', name: 'per head', expression: 'revenue / headcount' }))
      .toBe('per head = revenue / headcount');
  });

  it('says which way a sort went', () => {
    expect(transformSummary({ op: 'sort', column: 'revenue', direction: 'desc' }))
      .toBe('sorted by revenue largest first');
  });

  it('says how many categories a limit kept', () => {
    expect(transformSummary({ op: 'limit', count: 5 })).toBe('the first 5 categories');
  });
});
