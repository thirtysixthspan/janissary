// The arithmetic behind the three notices, and nothing else: no table, no chart, no sentence, no opinion.
// A notice that quotes a number the reader cannot check is a claim, not a notice, so every figure in one
// is computed here and stated in the sentence `insights.ts` builds from it.

import type { Cell, Table } from './table.js';
import type { VisualizationColumnView } from '../protocol.js';

// A column's values as numbers, in row order, with the cells that are not numbers dropped — which is the
// same rule the renderer applies, so a notice is never about a row the chart did not draw. A column that
// is not numeric at all yields nothing, and the detector that asked says nothing rather than asking again.
export function numericValues(table: Table, name: string): number[] {
  const column = table.columns.findIndex((one) => one.name === name);
  if (column === -1) return [];
  if (!isNumeric(table.columns[column])) return [];
  const values: number[] = [];
  for (const row of table.rows) {
    const cell = row[column];
    if (typeof cell === 'number' && Number.isFinite(cell)) values.push(cell);
  }
  return values;
}

// The same, as the x positions a rate is measured against. A date column is read as its instant — which
// the renderer already does to order the marks — and a number column as itself, so a rate per day and a
// rate per row are both measured in something. Text is not an axis a trend can run along, so a chart
// split by a category is not offered one.
export function positions(table: Table, name: string): number[] {
  const column = table.columns.findIndex((one) => one.name === name);
  if (column === -1) return [];
  const type = table.columns[column]?.type;
  if (type !== 'date' && type !== 'number') return [];
  const found: number[] = [];
  for (const row of table.rows) {
    const cell = row[column];
    if (type === 'date') {
      const instant = cell === null ? NaN : Date.parse(String(cell));
      if (Number.isFinite(instant)) found.push(instant);
    } else if (typeof cell === 'number' && Number.isFinite(cell)) found.push(cell);
  }
  return found;
}

function isNumeric(column: VisualizationColumnView | undefined): boolean {
  return column?.type === 'number';
}

// The middle of a set, the mean of the two middles for an even count. Sorted here rather than assumed
// sorted, because a caller that has already sorted pays for a second sort and a caller that has not
// would otherwise get a number out of the middle of its own ordering.
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? NaN;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

// One quantile by linear interpolation, so the quartiles below are the ones a spreadsheet draws and the
// fence derived from them is the fence a reader could work out with a pencil.
export function quantileOf(values: readonly number[], fraction: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.toSorted((a, b) => a - b);
  if (sorted.length === 1) return sorted[0] ?? NaN;
  const rank = fraction * (sorted.length - 1);
  const below = sorted[Math.floor(rank)];
  const above = sorted[Math.ceil(rank)];
  if (below === undefined || above === undefined) return below ?? above ?? NaN;
  return below + (above - below) * (rank - Math.floor(rank));
}

// The spread of the middle half, and the pair of fences around it. The rule is Tukey's: a value outside
// one and a half interquartile ranges of the middle half is an outlier, which is deliberately generous —
// it names about one value in a hundred as unusual on a normal distribution, and it is the rule that
// does not move when the values it is judging include the extreme one, which is the whole problem a mean
// and a standard deviation have.
export function fencesOf(values: readonly number[], multiple = 1.5): { low: number; high: number } {
  const first = quantileOf(values, 0.25);
  const third = quantileOf(values, 0.75);
  const range = third - first;
  return { low: first - multiple * range, high: third + multiple * range };
}

// The least-squares line through a series, as a slope and where it crosses zero — so a caller can ask
// both "how fast is this rising" and "what level would this predict at a point it has not got to".
// Least squares rather than a difference of endpoints because one outlier in the middle of a series moves
// an endpoint average by a third and a fitted line by almost nothing.
export function lineThrough(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const count = Math.min(xs.length, ys.length);
  if (count < 2) return { slope: NaN, intercept: NaN };
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < count; index += 1) {
    sumX += xs[index] ?? 0;
    sumY += ys[index] ?? 0;
  }
  const meanX = sumX / count;
  const meanY = sumY / count;
  let spread = 0;
  let rise = 0;
  for (let index = 0; index < count; index += 1) {
    const offsetX = (xs[index] ?? 0) - meanX;
    spread += offsetX * offsetX;
    rise += offsetX * ((ys[index] ?? 0) - meanY);
  }
  if (spread === 0) return { slope: NaN, intercept: meanY };
  const slope = rise / spread;
  return { slope, intercept: meanY - slope * meanX };
}

// The rate of change of y against x, in y per x.
export function slopeOf(xs: readonly number[], ys: readonly number[]): number {
  return lineThrough(xs, ys).slope;
}

// The mean and the spread of a set, in the pair a band is built from. The spread is the sample one for
// the same reason `aggregate.ts` divides by n-1: the values are a sample of something larger, and
// dividing by n would understate how far the next one is expected to sit.
export function meanAndSpread(values: readonly number[]): { mean: number; spread: number } {
  const count = values.length;
  if (count === 0) return { mean: NaN, spread: NaN };
  let total = 0;
  for (const value of values) total += value;
  const mean = total / count;
  if (count === 1) return { mean, spread: 0 };
  let squares = 0;
  for (const value of values) squares += (value - mean) ** 2;
  return { mean, spread: Math.sqrt(squares / (count - 1)) };
}

// How a cell is said in a sentence: a date column prints as its own text rather than as an instant,
// because a notice saying 1772668800000 is a notice nobody reads.
export function labelOf(cell: Cell | undefined): string {
  if (cell === undefined || cell === null) return '';
  if (typeof cell === 'number') return Number.isSafeInteger(cell) ? String(cell) : cell.toFixed(2);
  return String(cell);
}
