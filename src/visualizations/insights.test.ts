import { describe, expect, it } from 'vitest';
import { noticesFor } from './insights';
import type { Cell, Table } from './table';
import type { VisualizationChartRecord, VisualizationTableView } from '../protocol';

// A notice is a measurement the reader is being asked to trust, so each case here is a table a person
// can read and decide for themselves whether the sentence is deserved. Nothing about a notice is
// inferred from the implementation: every number in one is the number in the table.

function table(columns: { name: string; type: 'number' | 'date' | 'string' }[], rows: Cell[][]): Table {
  return { columns, rows } as Table;
}

// A steady series with one planted spike, which is the shape the fences exist to catch.
const LATENCY = table(
  [{ name: 'day', type: 'date' }, { name: 'latency', type: 'number' }],
  [
    ['2026-01-01', 100], ['2026-01-02', 104], ['2026-01-03', 98], ['2026-01-04', 102],
    ['2026-01-05', 101], ['2026-01-06', 99], ['2026-01-07', 103], ['2026-01-08', 100],
    ['2026-01-09', 102], ['2026-01-10', 4200],
  ],
);

function chartOf(over: Partial<VisualizationChartRecord> = {}): VisualizationChartRecord {
  return {
    id: 'chart-1',
    data: { kind: 'source' },
    kind: 'line',
    x: 'day',
    y: 'latency',
    title: 'Latency',
    refreshSeconds: 0,
    table: LATENCY as VisualizationTableView,
    transforms: [],
    ...over,
  } as unknown as VisualizationChartRecord;
}

describe('noticesFor', () => {
  it('names the row, the value, and the fences it is outside of', () => {
    const found = noticesFor([chartOf()]);
    const notice = found.find((one) => one.includes('4200'));
    expect(notice).toContain('2026-01-10 has a latency of 4200, outside the');
    expect(notice).toContain('that the middle half of the 9 other latency values occupies');
    expect(notice?.startsWith('In "Latency", ')).toBe(true);
  });

  it('says nothing about a series that is merely ordinary', () => {
    const ordinary = { columns: LATENCY.columns, rows: LATENCY.rows.slice(0, 9) };
    expect(noticesFor([chartOf({ table: ordinary as unknown as VisualizationTableView })])).toEqual([]);
  });

  // Three rows cannot be called unusual, and a detector that speaks on three is worse than none: a
  // reader has no way to tell a confident notice from a premature one.
  it('says nothing until there is enough of a distribution to be one', () => {
    const few = table(
      [{ name: 'day', type: 'date' }, { name: 'latency', type: 'number' }],
      [['2026-01-01', 1], ['2026-01-02', 1], ['2026-01-03', 99]],
    );
    expect(noticesFor([chartOf({ table: few as unknown as VisualizationTableView })])).toEqual([]);
  });

  // A series with no spread at all has no outliers and no band: the fences collapse onto the value and
  // every row is "outside" a range of zero width, which would be a notice about arithmetic.
  it('says nothing about a series where every value is the same', () => {
    const flat = table(
      [{ name: 'day', type: 'date' }, { name: 'latency', type: 'number' }],
      Array.from({ length: 12 }, (_, index) => [`2026-01-${String(index + 1).padStart(2, '0')}`, 7]),
    );
    expect(noticesFor([chartOf({ table: flat as unknown as VisualizationTableView })])).toEqual([]);
  });

  // The band is built from the values that came before and nothing after, so a point that is unusual
  // against its own history is reported and one that is merely the end of a rising series is not.
  it('reports a point outside the band its own earlier values have been within', () => {
    const rising = table(
      [{ name: 'day', type: 'date' }, { name: 'count', type: 'number' }],
      [
        ['2026-02-01', 10], ['2026-02-02', 11], ['2026-02-03', 10], ['2026-02-04', 9],
        ['2026-02-05', 10], ['2026-02-06', 11], ['2026-02-07', 10],
      ],
    );
    expect(noticesFor([chartOf({ y: 'count', table: rising as unknown as VisualizationTableView })])).toEqual([]);
  });

  // A rate that has changed is a different finding from a point that is odd, and the sentence says which
  // half is the steeper of the two rather than leaving a reader to work it out from two numbers.
  // The obvious failure of a slope comparison: both halves of a step are flat, so the two rates are both
  // zero and the ratio between them is nothing at all. A series that steps has changed and a detector
  // that reports nothing is the reader finding it themselves.
  it('reports a series that steps between two levels, which is not a change of rate', () => {
    const broken = table(
      [{ name: 'day', type: 'date' }, { name: 'errors', type: 'number' }],
      [
        ['2026-03-01', 1], ['2026-03-02', 1], ['2026-03-03', 1], ['2026-03-04', 1],
        ['2026-03-05', 8], ['2026-03-06', 8], ['2026-03-07', 8], ['2026-03-08', 8],
      ],
    );
    expect(noticesFor([chartOf({ y: 'errors', table: broken as unknown as VisualizationTableView })]))
      .toEqual(['In "Latency", the level of errors against day stepped at the middle of the series, from about 1 where the earlier points were heading to about 8 where the later ones are.']);
  });

  it('reports a rate that has changed by at least a factor of two', () => {
    const accelerating = table(
      [{ name: 'day', type: 'date' }, { name: 'errors', type: 'number' }],
      [
        ['2026-03-01', 1], ['2026-03-02', 2], ['2026-03-03', 3], ['2026-03-04', 4],
        ['2026-03-05', 20], ['2026-03-06', 30], ['2026-03-07', 40], ['2026-03-08', 50],
      ],
    );
    const found = noticesFor([chartOf({ y: 'errors', table: accelerating as unknown as VisualizationTableView })]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('rate of errors against day has changed by a factor of');
    expect(found[0]).toContain('later 4 points are the steeper');
  });

  // A rise is not a level shift: the two halves of a linear series sit at different medians because the
  // line went up, and calling that a step would report every trend as a fault.
  it('does not call a steady rise a step', () => {
    const rising = table(
      [{ name: 'day', type: 'date' }, { name: 'errors', type: 'number' }],
      [
        ['2026-03-01', 2], ['2026-03-02', 4], ['2026-03-03', 6], ['2026-03-04', 8],
        ['2026-03-05', 10], ['2026-03-06', 12], ['2026-03-07', 14], ['2026-03-08', 16],
      ],
    );
    expect(noticesFor([chartOf({ y: 'errors', table: rising as unknown as VisualizationTableView })])).toEqual([]);
  });

  it('needs four points in each half before it will call a rate changed', () => {
    const short = table(
      [{ name: 'day', type: 'date' }, { name: 'errors', type: 'number' }],
      [['2026-03-01', 1], ['2026-03-02', 1], ['2026-03-03', 9], ['2026-03-04', 9]],
    );
    expect(noticesFor([chartOf({ y: 'errors', table: short as unknown as VisualizationTableView })])).toEqual([]);
  });

  // A rate runs along an axis, and a category is not an axis: a bar chart split by service says nothing
  // about the order its categories happen to appear in.
  it('offers no rate for a chart whose x column is not ordered', () => {
    const byService = table(
      [{ name: 'service', type: 'string' }, { name: 'latency', type: 'number' }],
      [['auth', 1], ['auth', 1], ['auth', 1], ['auth', 1], ['auth', 1], ['auth', 1], ['auth', 2], ['auth', 9]],
    );
    // Not even a level shift: the halves of a series with no order to them are just the first rows and the
    // last rows, and a difference between those is a difference between two arbitrary cuts. What a
    // distribution can still say is a distribution, so the one value well outside the middle half is
    // named and the two time-based rules stay silent.
    expect(noticesFor([chartOf({ x: 'service', table: byService as unknown as VisualizationTableView })]))
      .toEqual(['In "Latency", auth has a latency of 2, outside the 0.625 to 1.625 that the middle half of the 7 other latency values occupies; auth has a latency of 9, outside the 0.625 to 1.625 that the middle half of the 7 other latency values occupies.']);
  });

  // A notice is one sentence on a screen, so a bounded report says that it is bounded: a reader who
  // finds two spikes and a third uncounted has to be able to tell which happened.
  it('counts the ones it did not report', () => {
    const many = table(
      [{ name: 'day', type: 'date' }, { name: 'latency', type: 'number' }],
      [
        ...Array.from({ length: 12 }, (_, index) => [`2026-04-${String(index + 1).padStart(2, '0')}`, 10]),
        ['2026-04-13', 4000], ['2026-04-14', 5000], ['2026-04-15', 6000], ['2026-04-16', 7000],
      ],
    );
    const found = noticesFor([chartOf({ table: many as unknown as VisualizationTableView })]);
    // The count rides on the last clause of the kind it counts rather than on every one of them, and the
    // fence report and the band report are separate sentences within the one sentence per chart.
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('and 2 more rows are outside the same range');
    expect(found[0]?.match(/2026-04-14 has a latency of 5000/gu)).toHaveLength(1);
  });

  // A chart with no numbers in it cannot produce a notice, and one with a measure that is text is not
  // refused loudly either: the renderer would not have drawn it.
  it('says nothing when the measure is not a number', () => {
    const words = table([{ name: 'day', type: 'date' }, { name: 'region', type: 'string' }], [
      ['2026-05-01', 'north'], ['2026-05-02', 'south'], ['2026-05-03', 'north'],
    ]);
    expect(noticesFor([chartOf({ y: 'region', table: words as unknown as VisualizationTableView })])).toEqual([]);
  });
});
