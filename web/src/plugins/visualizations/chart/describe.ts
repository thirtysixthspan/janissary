// Saying what a chart shows, in words and in rows. Pure throughout, and derived from the same marks the
// renderer draws rather than from the table it was handed, so what the chart says and what the chart shows
// cannot come to disagree.

import { marksFor, scatterFor, type ChartShape, type Point, type Table } from './points';

export type DataCell = string | number;

export type DataColumn = { name: string; numeric: boolean };

export type DataTable = { columns: DataColumn[]; rows: DataCell[][] };

// The name a measure is known by: the specification's own label when it gave one, and its column name
// when it did not.
function measureName(chart: ChartShape): string {
  return chart.yLabel ?? chart.y;
}

function categoryName(chart: ChartShape): string {
  return chart.xLabel ?? chart.x;
}

function extremes(points: readonly Point[]): { lowest: Point; highest: Point } | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  let lowest = first;
  let highest = first;
  for (const point of points) {
    if (point.value < lowest.value) lowest = point;
    if (point.value > highest.value) highest = point;
  }
  return { lowest, highest };
}

// A measure carries fractions a reader would rather not be told to seventeen places, and rounding for
// display must not change the value the chart plots, so it happens here and nowhere else.
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function describePoints(kind: string, chart: ChartShape, points: readonly Point[]): string {
  const bounds = extremes(points);
  if (!bounds) return `A ${kind} chart of ${measureName(chart)} with nothing to plot.`;
  const { lowest, highest } = bounds;
  const first = points.at(0);
  const last = points.at(-1);
  if (first === undefined || last === undefined) return `A ${kind} chart with nothing to plot.`;
  // A category is not a range, so when the first and last marks share one there is no span to name —
  // saying "over north" about a chart whose middle mark is south would claim something the data does not
  // say.
  const span = first.label === last.label ? '' : ` over ${first.label} to ${last.label}`;
  return `A ${kind} chart of ${measureName(chart)}${span}: ${points.length} marks, `
    + `from ${round(lowest.value)} at ${lowest.label} to ${round(highest.value)} at ${highest.label}.`;
}

// A pie is the one kind whose marks are not band/value pairs, so its sentence is about the summed
// categories its slices are cut from.
function describeSlices(chart: ChartShape, marks: ReturnType<typeof marksFor>): string {
  const { slices } = marks;
  if (slices.length === 0) return `A pie chart of ${measureName(chart)} with nothing to plot.`;
  const sorted = slices.toSorted((a, b) => b.value - a.value);
  const largest = sorted.at(0);
  const smallest = sorted.at(-1);
  if (largest === undefined || smallest === undefined) return `A pie chart with nothing to plot.`;
  return `A pie chart of ${measureName(chart)} summed over ${slices.length} categories: `
    + `${largest.label} is the largest at ${round(largest.value)}, `
    + `${smallest.label} the smallest at ${round(smallest.value)}.`;
}

// A scatter plots both axes as numbers, so its sentence is about two numeric columns rather than a
// category and a measure.
function describeScatter(chart: ChartShape, points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return `A scatter chart of ${measureName(chart)} against ${chart.x} with nothing to plot.`;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return `A scatter chart of ${measureName(chart)} against ${chart.x}: ${points.length} points, `
    + `${chart.x} from ${round(Math.min(...xs))} to ${round(Math.max(...xs))}, `
    + `${measureName(chart)} from ${round(Math.min(...ys))} to ${round(Math.max(...ys))}.`;
}

// One sentence naming the kind, the measure, its range, and both ends of it. Every number in it is read
// off marks already computed, so it describes the data rather than interpreting it.
export function describeChart(table: Table, chart: ChartShape): string {
  if (chart.kind === 'pie') return describeSlices(chart, marksFor(table, chart));
  if (chart.kind === 'scatter') return describeScatter(chart, scatterFor(table, chart));
  return describePoints(chart.kind, chart, marksFor(table, chart).points);
}

// The drawn marks as rows, one row per mark, so the table beside a chart is the chart's own data. The
// source's 500 rows and 32 columns would answer a different question, and not the one the picture poses.
export function dataTableFor(table: Table, chart: ChartShape): DataTable {
  const category: DataColumn = { name: categoryName(chart), numeric: false };
  const measure: DataColumn = { name: measureName(chart), numeric: true };
  if (chart.kind === 'pie') {
    return { columns: [category, measure], rows: marksFor(table, chart).slices.map((slice) => [slice.label, slice.value]) };
  }
  if (chart.kind === 'scatter') {
    // A scatter's x is a number rather than a category, so the column carries the numeric flag the
    // renderer right-aligns on.
    return {
      columns: [{ name: categoryName(chart), numeric: true }, measure],
      rows: scatterFor(table, chart).map((point) => [point.x, point.y]),
    };
  }
  const marks = marksFor(table, chart);
  // The series column is carried only when the specification named one, which is the same condition
  // `marksFor` splits on — a chart with no series column has a single unnamed series and nothing to show.
  if (chart.series === undefined) {
    return { columns: [category, measure], rows: marks.points.map((point) => [point.label, point.value]) };
  }
  const series: DataColumn = { name: chart.series, numeric: false };
  return {
    columns: [category, measure, series],
    rows: marks.points.map((point) => [point.label, point.value, point.series]),
  };
}
