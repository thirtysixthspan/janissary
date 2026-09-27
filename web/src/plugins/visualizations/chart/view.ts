// A way of looking at the marks a chart is already showing: an order, a cap on how many categories are
// drawn, and a filter down to one. Pure throughout, and it only reorders, drops, and renumbers what it
// is handed — the arithmetic behind the marks lives in ./points, and this never re-derives one.

import { marksFor, type ChartShape, type Marks, type Point, type Table } from './points';

export type SortOrder = 'source' | 'category' | 'value';

export type ChartView = {
  sort: SortOrder;
  // How many categories are drawn, where 0 means all of them.
  limit: number;
  // The one category a filter is holding, absent when none is.
  focus?: string;
};

export const DEFAULT_VIEW: ChartView = { sort: 'source', limit: 0 };

// What a chart looks like when nobody has touched it, which is also what `viewMarks` returns its input
// as: a chart that nobody narrows is the chart that shipped, byte for byte.
export function isDefault(view: ChartView): boolean {
  return view.sort === 'source' && view.limit === 0 && view.focus === undefined;
}

function bySource(a: Point, b: Point): number {
  return a.band - b.band;
}

// A stable sort throughout, because two marks of equal value are two marks the source listed in an order
// and an unstable sort would be free to redraw the chart differently on the next run.
function byCategory(a: Point, b: Point): number {
  return a.label.localeCompare(b.label) || a.band - b.band;
}

function byValue(a: Point, b: Point): number {
  return b.value - a.value || a.band - b.band;
}

const ORDERS: Record<SortOrder, (a: Point, b: Point) => number> = {
  source: bySource,
  category: byCategory,
  value: byValue,
};

// The categories present, in the order the marks are drawn. A cap is counted in these rather than in
// marks, so "top five" is five categories and a split chart loses a whole band rather than one of its
// series — which would leave a bar a different height from its neighbour with nothing to explain it.
export function bandsOf(points: readonly Point[]): string[] {
  const bands: string[] = [];
  for (const point of points) if (!bands.includes(point.label)) bands.push(point.label);
  return bands;
}

function keepBands(points: readonly Point[], labels: readonly string[]): Point[] {
  return points.filter((point) => labels.includes(point.label));
}

export function viewMarks(marks: Marks, view: ChartView): Marks {
  if (isDefault(view)) return marks;
  const filtered = view.focus === undefined
    ? marks.points
    : marks.points.filter((point) => point.label === view.focus);
  const ordered = filtered.toSorted(ORDERS[view.sort] ?? bySource);
  const capped = view.limit > 0
    ? keepBands(ordered, bandsOf(ordered).slice(0, view.limit))
    : ordered;
  // Renumbered because every band the axis draws is numbered by the marks that survived, and a hole in
  // them would be a hole in the chart.
  const points = capped.map((point, band) => ({ ...point, band }));
  return { ...marks, points };
}

// The one composition every consumer of the marks goes through, so the picture, the table beside it, and
// the sentence a screen reader is given cannot describe three different things.
export function viewedMarksFor(table: Table, chart: ChartShape, view: ChartView): Marks {
  return viewMarks(marksFor(table, chart), view);
}
