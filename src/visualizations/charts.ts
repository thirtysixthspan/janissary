import type { ChartShape, ChartSpec } from '../protocol.js';
import { chartNotes, datasetKey, resolve } from './chart-spec.js';
import { MAX_CHARTS, MAX_DATASETS } from './chart-record.js';
import { noticesFor } from './insights.js';
import type { VisualizationRecord } from './store.js';
import type {
  VisualizationChartRecord,
  VisualizationChartView,
  VisualizationDataRef,
  VisualizationDatasetView,
  VisualizationTableView,
} from '../protocol.js';
// The record's charts, as the one place that changes them. Every path that draws, replaces, re-reads or
// removes a chart comes through here, so there is a single answer to "what does this record look like
// now" and no caller has to remember to re-resolve after it changed something.
//
// A stored chart keeps its transformations, because that is what a re-read re-applies and what the
// model is shown; the wire view does not, because the browser never applies them and reads their words
// instead. `view.ts` makes that cut.

export function datasetFor(record: VisualizationRecord, key: string): VisualizationDatasetView | undefined {
  return record.datasets.find((dataset) => dataset.key === key);
}

// The dataset a key names, created empty if it is not there yet. Refused past `MAX_DATASETS`, and the
// refusal is load-bearing rather than defensive: the store's record guard applies the same ceiling, so
// a record holding one more than the guard accepts cannot be read back at all — the visualization would
// vanish from the index with nothing but a stderr warning to say so. A dataset is dropped when the last
// chart drawing from it is removed, which is what keeps the ceiling from being reached by ordinary use.
export function ensureDataset(
  record: VisualizationRecord,
  data: VisualizationDataRef,
  make: () => VisualizationDatasetView,
): VisualizationDatasetView | undefined {
  const key = datasetKey(data);
  const existing = datasetFor(record, key);
  if (existing) return existing;
  if (record.datasets.length >= MAX_DATASETS) return undefined;
  const created = make();
  record.datasets.push(created);
  return created;
}

// A dataset with nothing left reading it, dropped so the ceiling above is a bound on what is in use
// rather than on what has ever been named.
export function pruned(record: VisualizationRecord): void {
  const used = new Set(record.charts.map((chart) => datasetKey(chart.data)));
  record.datasets = record.datasets.filter((dataset) => dataset.key === 'source' || used.has(dataset.key));
}

// A chart as it stands, with its resolved table filled in. A specification that cannot be drawn
// against the data it names is refused with the reason rather than stored, because a chart with no
// marks opens on an empty plot area that says nothing about why.
export function drawn(
  record: VisualizationRecord,
  data: VisualizationDataRef,
  transforms: ChartSpec['transforms'],
  shape: ChartShape,
  id: string,
  refreshSeconds: number,
): { chart: VisualizationChartRecord } | { error: string } {
  const dataset = datasetFor(record, datasetKey(data));
  const spec: ChartSpec = { ...shape, data, transforms };
  const resolved = resolve(dataset?.table, spec);
  if ('error' in resolved) return resolved;
  return {
    chart: {
      ...spec,
      id,
      refreshSeconds,
      table: resolved.table,
      ...(dataset?.readAt !== undefined && { readAt: dataset.readAt }),
      ...(dataset?.error !== undefined && { error: dataset.error }),
    },
  };
}

// What the data behind this record's charts has going on, rebuilt from scratch every time anything
// about them changes. Rebuilt rather than accumulated so a live update that has come back down stops
// reporting the spike, and so a chart the user removed takes its notice with it without a second list to
// reconcile — the charts are the whole of what a notice is about.
export function noticed(record: VisualizationRecord): string[] {
  record.notices = noticesFor(record.charts);
  return record.notices;
}

// A chart carrying an id, merged over the chart that id names. Merging rather than replacing is what
// makes "just change the title" one field and nothing else moving; an id that names no chart is a new
// chart, because a reply that asked for a chart and produced nothing is worse than one that made a
// new one.
export function placed(
  record: VisualizationRecord,
  entry: { id?: string; data?: VisualizationDataRef; transforms?: ChartSpec['transforms'] } & ChartShape,
  mintId: () => string,
): { chart: VisualizationChartRecord } | { error: string } {
  const existing = entry.id === undefined ? undefined : record.charts.find((chart) => chart.id === entry.id);
  if (existing === undefined && record.charts.length >= MAX_CHARTS) {
    return { error: `a visualization may hold ${MAX_CHARTS} charts, and this one already holds them` };
  }
  const data = entry.data ?? existing?.data ?? { kind: 'source' as const };
  // A transform list replaces rather than merges: a reply that supplies one is stating the whole list
  // the chart now applies, and appending to it would make "only 2024" twice after it was asked twice.
  const transforms = entry.transforms ?? existing?.transforms ?? [];
  const result = drawn(record, data, transforms, shapeOf(entry), existing?.id ?? entry.id ?? mintId(), existing?.refreshSeconds ?? 0);
  if ('error' in result) return result;
  const chart = { ...result.chart, transforms: [...transforms] };
  record.charts = existing === undefined
    ? [...record.charts, chart]
    : record.charts.map((other) => (other.id === existing.id ? chart : other));
  return { chart };
}

function shapeOf(entry: ChartShape): ChartShape {
  return {
    kind: entry.kind,
    x: entry.x,
    y: entry.y,
    title: entry.title,
    ...(entry.series !== undefined && { series: entry.series }),
    ...(entry.aggregate !== undefined && { aggregate: entry.aggregate }),
    ...(entry.percentile !== undefined && { percentile: entry.percentile }),
    ...(entry.xUnit !== undefined && { xUnit: entry.xUnit }),
    ...(entry.xLabel !== undefined && { xLabel: entry.xLabel }),
    ...(entry.yLabel !== undefined && { yLabel: entry.yLabel }),
  };
}

// A chart restamped with what its dataset now says. The read time and the error are set rather than
// spread, so a dataset that has stopped failing stops saying that it is.
function restamped(
  chart: VisualizationChartRecord,
  dataset: VisualizationDatasetView | undefined,
  table: VisualizationTableView,
): VisualizationChartRecord {
  const next = { ...chart, table };
  // Set rather than spread, so a dataset that has stopped failing also stops saying that it is.
  if (dataset === undefined || dataset.readAt === undefined) delete next.readAt;
  else next.readAt = dataset.readAt;
  if (dataset === undefined || dataset.error === undefined) delete next.error;
  else next.error = dataset.error;
  return next;
}

// Re-resolve every chart that draws from one dataset, after its table or its document changed. A chart
// that no longer fits — a column the new read does not have — keeps the table it had and records the
// reason, which is the same trade a failed re-read makes: clearing a working chart because one read
// went wrong costs the user the picture at the moment it is worth having.
export function redrawn(record: VisualizationRecord, key: string): string[] {
  const dataset = datasetFor(record, key);
  const reasons: string[] = [];
  record.charts = record.charts.flatMap((chart) => {
    if (datasetKey(chart.data) === key) {
      const result = resolve(dataset?.table, chart);
      if ('error' in result) {
        reasons.push(result.error);
        return [restamped(chart, dataset, chart.table)];
      }
      return [restamped(chart, dataset, result.table)];
    }
    return [chart];
  });
  // A live update is the case the notices exist for: the read that produced them is the same read that
  // decides whether the spike is still there, so they are rebuilt here rather than waiting for the model
  // to be asked again.
  noticed(record);
  return reasons;
}

export function chartById(record: VisualizationRecord, id: string): VisualizationChartRecord | undefined {
  return record.charts.find((chart) => chart.id === id);
}

export function chartViewOf(chart: VisualizationChartRecord): VisualizationChartView {
  return {
    id: chart.id,
    data: { ...chart.data },
    notes: chartNotes(chart),
    refreshSeconds: chart.refreshSeconds,
    table: chart.table,
    kind: chart.kind,
    x: chart.x,
    y: chart.y,
    title: chart.title,
    ...(chart.readAt !== undefined && { readAt: chart.readAt }),
    ...(chart.error !== undefined && { error: chart.error }),
    ...(chart.series !== undefined && { series: chart.series }),
    ...(chart.aggregate !== undefined && { aggregate: chart.aggregate }),
    ...(chart.xLabel !== undefined && { xLabel: chart.xLabel }),
    ...(chart.yLabel !== undefined && { yLabel: chart.yLabel }),
  };
}
