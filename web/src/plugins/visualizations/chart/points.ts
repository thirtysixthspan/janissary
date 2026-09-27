// Turning a table plus a chart specification into numbers a renderer can draw. Pure throughout, so the
// whole of the chart's arithmetic is testable without a DOM, a canvas, or a render.

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
  const points: Point[] = [];
  for (const [band, row] of table.rows.entries()) {
    const value = numeric(row[yi]);
    if (value === undefined) continue;
    points.push({
      band,
      value,
      series: si === -1 ? SINGLE_SERIES : label(row[si]),
      label: label(row[xi]),
    });
  }
  if (chart.kind === 'pie') return { points, slices: slicesFor(points), series: [] };
  return { points, slices: [], series: seriesNames(points, si !== -1) };
}

// A pie sums the measure per category. That is the one aggregation the grammar has, and it is the only
// one there can be: every other aggregate would be a decision the user did not ask anyone to make.
function slicesFor(points: readonly Point[]): PieSlice[] {
  const totals = new Map<string, number>();
  for (const point of points) {
    totals.set(point.label, (totals.get(point.label) ?? 0) + point.value);
  }
  return [...totals].map(([name, value]) => ({ label: name, value }));
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
