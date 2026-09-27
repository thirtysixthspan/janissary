// Turning a table plus a chart specification into numbers a renderer can draw. Pure throughout, so the
// whole of the chart's arithmetic is testable without a DOM, a canvas, or a render.

import { groupsFor, reduce, type Aggregate } from './aggregate';

// Re-exported because a chart specification names an aggregate, and the specification's type is
// declared here; the reduction itself lives beside the arithmetic that applies it.
export type { Aggregate } from './aggregate';

export type Cell = string | number | boolean | null;

export type Column = { name: string; type: 'number' | 'boolean' | 'string' };

export type Table = { columns: Column[]; rows: Cell[][] };

// The band a category mark sits in, and the value it plots. `label` is the category text, kept beside
// the band so an axis and a legend read from one place rather than each recomputing it.
export type Point = { band: number; value: number; series: string; label: string };

export type PieSlice = { label: string; value: number };

export type Marks = { points: Point[]; slices: PieSlice[]; series: string[] };

// What a scatter draws instead: the x column is numeric, so a point sits where its value puts it rather
// than in an evenly spaced band. Kept separate because only that one kind reads it.
export type ScatterPoint = { x: number; y: number };

export type ChartShape = {
  kind: string;
  x: string;
  y: string;
  series?: string;
  aggregate?: Aggregate;
  title: string;
  xLabel?: string;
  yLabel?: string;
};

// The stand-in series name for a chart with no series column, so a single-series chart takes exactly the
// same path through the renderer as a multi-series one.
export const SINGLE_SERIES = '';

// A cell as a number, or undefined when it is not one. Numeric strings count: a CSV read produces
// them, and a chart that ignored them would be blank for exactly the sources people point at.
export function numeric(cell: Cell | undefined): number | undefined {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : undefined;
  if (typeof cell !== 'string' || cell.trim() === '') return undefined;
  const parsed = Number(cell);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function label(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return '';
  return String(cell);
}

function columnIndex(table: Table, name: string | undefined): number {
  if (name === undefined) return -1;
  return table.columns.findIndex((column) => column.name === name);
}

function seriesNames(points: readonly Point[], split: boolean): string[] {
  if (!split) return [SINGLE_SERIES];
  const names: string[] = [];
  for (const point of points) if (!names.includes(point.series)) names.push(point.series);
  return names;
}

// Every mark the specification asks for, in row order. A row whose measure is not a number is dropped
// rather than guessed at, and it is dropped here so that no component has to decide what to do with one
// — which is also why a column of text produces an empty chart rather than a chart full of zeroes.
export function marksFor(table: Table, chart: ChartShape): Marks {
  const xi = columnIndex(table, chart.x);
  const yi = columnIndex(table, chart.y);
  if (xi === -1 || yi === -1) return { points: [], slices: [], series: [] };
  const si = columnIndex(table, chart.series);
  // A specification that names a series column the table does not have cannot be drawn as asked, and
  // quietly falling back to one unnamed series would draw a different chart than the one requested.
  if (chart.series !== undefined && si === -1) return { points: [], slices: [], series: [] };
  const raw: Point[] = [];
  for (const [band, row] of table.rows.entries()) {
    const value = numeric(row[yi]);
    if (value === undefined) continue;
    raw.push({
      band,
      value,
      series: si === -1 ? SINGLE_SERIES : label(row[si]),
      label: label(row[xi]),
    });
  }
  const aggregate = effectiveAggregate(chart);
  if (aggregate === undefined) {
    if (chart.kind === 'pie') return { points: raw, slices: slicesFor(raw), series: [] };
    return { points: raw, slices: [], series: seriesNames(raw, si !== -1) };
  }
  // A pie is cut from categories and has no second dimension to split by; every other kind is banded by
  // category with its series inside, which is the shape the bar renderer already draws a multi-series
  // chart in.
  const pie = chart.kind === 'pie';
  const split = !pie && si !== -1;
  const reduced = groupsFor(raw, split, SINGLE_SERIES);
  if (pie) {
    return {
      points: raw,
      slices: reduced.map((group) => ({ label: group.label, value: reduce(aggregate, group.values) })),
      series: [],
    };
  }
  // Bands are numbered per category rather than per group, because a band is a slot on the category
  // axis and the series share it. Numbering by group would give each series its own slot, which is a
  // different chart rather than an aggregated one.
  const bands = new Map<string, number>();
  const points = reduced.map((group) => {
    let band = bands.get(group.label);
    if (band === undefined) {
      band = bands.size;
      bands.set(group.label, band);
    }
    return { band, value: reduce(aggregate, group.values), series: group.series, label: group.label };
  });
  return { points, slices: [], series: seriesNames(points, split) };
}

// The aggregate a chart applies, where a pie sums whether or not it was told to: a pie is a share of a
// whole, and that whole is the sum of the rows it is cut from. Everything else aggregates only when
// asked, so a chart whose rows are already one answer each is left exactly as it was.
function effectiveAggregate(chart: ChartShape): Aggregate | undefined {
  if (chart.aggregate !== undefined) return chart.aggregate;
  return chart.kind === 'pie' ? 'sum' : undefined;
}

// A pie sums the measure per category. That is the grammar's one built-in aggregation, reached through
// the same reduction as every other one, so there is a single place that aggregates rather than two that
// could disagree.
function slicesFor(points: readonly Point[]): PieSlice[] {
  return groupsFor(points, false, SINGLE_SERIES)
    .map((group) => ({ label: group.label, value: reduce('sum', group.values) }));
}

export function scatterFor(table: Table, chart: ChartShape): ScatterPoint[] {
  const xi = columnIndex(table, chart.x);
  const yi = columnIndex(table, chart.y);
  if (xi === -1 || yi === -1) return [];
  return table.rows.flatMap((row) => {
    const x = numeric(row[xi]);
    const y = numeric(row[yi]);
    return x === undefined || y === undefined ? [] : [{ x, y }];
  });
}

export function extentOf(values: readonly number[]): { min: number; max: number } {
  const first = values[0];
  if (first === undefined) return { min: 0, max: 1 };
  let min = first;
  let max = first;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  // A measure that never varies still needs a range, or every division below divides by zero.
  return min === max ? { min: min - 1, max: max + 1 } : { min, max };
}
