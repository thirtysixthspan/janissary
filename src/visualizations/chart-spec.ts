// The one definition of what a chart specification may say, and the gate between a model's reply and a
// chart a user sees.
//
// Three places need this grammar and three copies is three ways to disagree about what a stored chart
// means: the store's record guard, the reply parser, and the resolver. So the lists and the guards
// live here once, and the store and the parser use them rather than repeating them — which is also
// what keeps `shared.ts` inside the file-size limit, since it re-declares the same grammar for the
// browser and can only afford to be as large as the removals make it.
//
// A reply is a value produced by a system that was handed a sample of someone else's data, so it is
// checked against the real table before it is stored: a column it named has to exist, the measure has
// to be numeric, a transformation has to name a column that is there, and a pie has to have a category
// to slice. A specification that fails is refused with a reason the chat can show, and the model's own
// words are kept instead of something unusable.

import { isRecord } from '../value-guards.js';
import { transformed, transformSummary } from './transforms.js';
import type { Table } from './table.js';
import type {
  ChartShape,
  ChartSpec,
  VisualizationAggregate,
  VisualizationChartKind,
  VisualizationCompare,
  VisualizationDataRef,
  VisualizationTableView,
  VisualizationTransform,
} from '../protocol/visualizations.js';

export const CHART_KINDS: readonly VisualizationChartKind[] = ['bar', 'line', 'area', 'scatter', 'pie'];
export const AGGREGATES: readonly VisualizationAggregate[] = ['sum', 'mean', 'count', 'min', 'max'];
export const COMPARES: readonly VisualizationCompare[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'];

// Named bounds, for the reason the row cap in `table.ts` is: a chart's table is re-sent on essentially
// every mutation, so an unbounded step list is a model's reply deciding how much work every keystroke
// in every tab does. Checked here, at the grammar, rather than in the applier, because every route
// into a stored transformation goes through a guard and one place is easier to keep true.
export const MAX_TRANSFORMS = 16;
export const MAX_FILTER_VALUES = 32;

// The optional half of a specification: each field present must be usable, and a field the grammar has
// no room for fails the whole specification rather than being dropped. Dropping an unknown aggregate
// would leave a chart that draws successfully and means something other than what the model said,
// which is the one failure a chart cannot be allowed to make silently.
function optionalShapeOf(value: Record<string, unknown>): Partial<ChartShape> | undefined {
  if (value.series !== undefined && (typeof value.series !== 'string' || value.series === '')) return undefined;
  if (value.aggregate !== undefined && !isAggregate(value.aggregate)) return undefined;
  if (value.xLabel !== undefined && typeof value.xLabel !== 'string') return undefined;
  if (value.yLabel !== undefined && typeof value.yLabel !== 'string') return undefined;
  return {
    ...(value.series !== undefined && { series: value.series }),
    ...(value.aggregate !== undefined && { aggregate: value.aggregate }),
    ...(value.xLabel !== undefined && { xLabel: value.xLabel }),
    ...(value.yLabel !== undefined && { yLabel: value.yLabel }),
  };
}

// The part of a specification a reply states, read out of an untrusted value. `data` and `transforms`
// are fillable and are read elsewhere: a chart being added says where its data comes from, and one
// being changed may leave both alone, because "just change the title" is one field and nothing else
// moving. Every field here is required, so a half-specified chart is refused rather than filled in with
// a guess.
export function chartShapeOf(value: Record<string, unknown>): ChartShape | undefined {
  if (!isKind(value.kind)) return undefined;
  if (typeof value.x !== 'string' || value.x === '') return undefined;
  if (typeof value.y !== 'string' || value.y === '') return undefined;
  if (typeof value.title !== 'string' || value.title.trim() === '') return undefined;
  const optional = optionalShapeOf(value);
  if (!optional) return undefined;
  return { kind: value.kind, x: value.x, y: value.y, title: value.title, ...optional };
}

export function isChartShape(value: unknown): value is ChartShape {
  return isRecord(value) && chartShapeOf(value) !== undefined;
}

export function isAggregate(value: unknown): value is VisualizationAggregate {
  return typeof value === 'string' && (AGGREGATES as readonly string[]).includes(value);
}

function isKind(value: unknown): value is VisualizationChartKind {
  return typeof value === 'string' && (CHART_KINDS as readonly string[]).includes(value);
}

function isCell(value: unknown): boolean {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

// The key a chart's data is stored under, and the one thing the client never has to look up: a chart
// carrying its own read state means a payload with no dataset array and no identifier to resolve.
export function datasetKey(data: VisualizationDataRef): string {
  return data.kind === 'source' ? 'source' : data.path;
}

export function isDataRef(value: unknown): value is VisualizationDataRef {
  if (!isRecord(value)) return false;
  if (value.kind === 'source') return Object.keys(value).length === 1;
  return value.kind === 'file' && typeof value.path === 'string' && value.path !== '';
}

// `in` is a membership test, so it is the only comparison that takes a list, and the list is bounded
// here rather than where it is applied. Every other comparison takes one value, and a list beside one
// is refused rather than quietly ignored.
function isFilterStep(value: Record<string, unknown>): boolean {
  if (typeof value.column !== 'string' || value.column === '') return false;
  if (typeof value.compare !== 'string' || !(COMPARES as readonly string[]).includes(value.compare)) return false;
  if (value.compare !== 'in') return value.values === undefined && (value.value === undefined || isCell(value.value));
  return Array.isArray(value.values)
    && value.values.length > 0
    && value.values.length <= MAX_FILTER_VALUES
    && value.values.every((entry) => isCell(entry));
}

function isNamed(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

export function isTransform(value: unknown): value is VisualizationTransform {
  if (!isRecord(value)) return false;
  if (value.op === 'filter') return isFilterStep(value);
  if (value.op === 'derive') return isNamed(value.name) && isNamed(value.expression);
  if (value.op === 'sort') {
    return isNamed(value.column) && (value.direction === 'asc' || value.direction === 'desc');
  }
  if (value.op === 'limit') {
    return typeof value.count === 'number' && Number.isSafeInteger(value.count) && value.count >= 1;
  }
  return false;
}

export function isTransformList(value: unknown): value is VisualizationTransform[] {
  return Array.isArray(value) && value.length <= MAX_TRANSFORMS && value.every(isTransform);
}

// The same gate, against a real table. A chart naming a column the table does not have is not stored,
// and neither is one whose measure is not numeric: the tab would open on a plot area with nothing in
// it.
export function validateChart(chart: ChartShape, table: Table): { error: string } | { ok: true } {
  const x = table.columns.find((column) => column.name === chart.x);
  if (!x) return { error: `no column named "${chart.x}"` };
  const y = table.columns.find((column) => column.name === chart.y);
  if (!y) return { error: `no column named "${chart.y}"` };
  if (chart.series !== undefined && table.columns.every((column) => column.name !== chart.series)) {
    return { error: `no column named "${chart.series}"` };
  }
  if (y.type !== 'number') return { error: `"${chart.y}" is not a numeric column` };
  if (chart.kind === 'pie' && x.type === 'number') {
    return { error: `a pie needs a category to slice, and "${chart.x}" is numeric` };
  }
  return { ok: true };
}

// The one function that carries a raw table plus a whole chart specification to the table the chart is
// drawn from. The transformations are applied first, each against the table the one before it left, and
// the specification is checked against the result rather than against the raw table — so a derived
// column a chart then plots is a column that exists by the time it is needed. Every caller goes through
// this, which is why there is no separate validation step any of them can forget.
export function resolve(
  source: VisualizationTableView | undefined,
  chart: ChartSpec,
): { table: VisualizationTableView } | { error: string } {
  if (!source) return { error: 'there is no data to draw from yet' };
  const applied = transformed(source, chart.transforms, chart.x);
  if ('error' in applied) return applied;
  const verdict = validateChart(chart, applied.table);
  if ('error' in verdict) return verdict;
  // The row count a chart reports is the count its own transformations left, so a limit says how many
  // rows there are; the cap says how many of what was read, which is the source's own flag.
  return {
    table: {
      columns: applied.table.columns,
      rows: applied.table.rows,
      total: applied.table.rows.length,
      truncated: source.truncated,
    },
  };
}

// One clause per transformation, in the order they are applied. This is the only place a
// transformation becomes words, and both the caption under a chart and the sentence a chart leaves
// behind when the model changed it without explaining itself are built from it — which is why the
// browser receives the words rather than the grammar.
export function chartNotes(chart: Pick<ChartSpec, 'transforms'>): string[] {
  return chart.transforms.map((step) => transformSummary(step));
}

// Each aggregate said the way a sentence can carry it. A suffix would be shorter and wrong for four of
// the five — "meanmed", "countmed" — so the wording is written out rather than composed.
const AGGREGATE_PHRASES: Record<VisualizationAggregate, string> = {
  sum: 'summed',
  mean: 'averaged',
  count: 'counted',
  min: 'reduced to the smallest',
  max: 'reduced to the largest',
};

// What a chart is now, in one sentence, for the case where the model changed it and said nothing.
// Composed from the specification rather than invented: a sentence built from what the chart
// demonstrably is worth reading, where an invented explanation would be worse than the empty reply it
// replaces. The model's own words always win — this is only reached when there are none. A chart that
// transforms is described as transforming and one that aggregates as aggregating, because "revenue by
// region" with no word about either reads as one bar per transaction and is not.
export function chartSummary(chart: ChartSpec): string {
  const split = chart.series === undefined ? '' : `, split by ${chart.series}`;
  const how = chart.aggregate === undefined ? '' : `, ${AGGREGATE_PHRASES[chart.aggregate]}`;
  const notes = chartNotes(chart);
  const steps = notes.length === 0 ? '' : `, over data ${notes.join(', then ')}`;
  return `Now a ${chart.kind} chart of ${chart.y} by ${chart.x}${split}${how}${steps}.`;
}
