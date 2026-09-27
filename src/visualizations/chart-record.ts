import { isRecord } from '../value-guards.js';
import { isDataRef, isTransformList } from './chart-spec.js';
import type {
  VisualizationChartRecord,
  VisualizationDatasetView,
  VisualizationTableView,
} from '../protocol/visualizations.js';

// The guards for the two values a stored record holds that the grammar also has an opinion about: a
// chart with everything a host resolves onto it, and a dataset with the raw table a chart's
// transformations are applied to. They live beside the grammar rather than inside `store.ts` because
// the reply parser builds the same charts and has to be refused for the same reasons, and three copies
// of "is this a chart" is three places for a stored chart to differ from a drawn one.
//
// The record's own guards — the id, the timestamps, the model pair, the turns — stay in `store.ts`,
// because nothing else needs them.

// Two bounds, for the reason `MAX_TRANSFORMS` is: `emitState` re-broadcasts every tab's payload on
// essentially every mutation, and a chart's table is the payload. A visualization's cost is the sum of
// its charts' bounded tables, so eight of them is the ceiling rather than a target. The real fix is
// the delta-and-sequence transport `architecture-principles.md` §8 names, which is well outside this
// feature.
export const MAX_CHARTS = 8;
export const MAX_DATASETS = 8;

export function isTable(value: unknown): value is VisualizationTableView {
  return isRecord(value)
    && Array.isArray(value.columns)
    && value.columns.every((column) => isRecord(column)
      && typeof column.name === 'string'
      && typeof column.type === 'string')
    && Array.isArray(value.rows)
    && typeof value.total === 'number'
    && typeof value.truncated === 'boolean';
}

export function isChart(value: unknown): value is VisualizationChartRecord {
  return isRecord(value)
    && typeof value.id === 'string' && value.id !== ''
    && isDataRef(value.data)
    && isTransformList(value.transforms)
    && typeof value.refreshSeconds === 'number' && value.refreshSeconds >= 0
    && (value.readAt === undefined || typeof value.readAt === 'number')
    && (value.error === undefined || typeof value.error === 'string')
    && isTable(value.table)
    && typeof value.kind === 'string'
    && typeof value.x === 'string' && typeof value.y === 'string'
    && typeof value.title === 'string'
    && (value.series === undefined || typeof value.series === 'string')
    && (value.aggregate === undefined || typeof value.aggregate === 'string')
    && (value.xLabel === undefined || typeof value.xLabel === 'string')
    && (value.yLabel === undefined || typeof value.yLabel === 'string');
}

export function isDataset(value: unknown): value is VisualizationDatasetView {
  return isRecord(value)
    && typeof value.key === 'string' && value.key !== ''
    && (value.table === undefined || isTable(value.table))
    && (value.document === undefined || typeof value.document === 'string')
    && (value.readAt === undefined || typeof value.readAt === 'number')
    && (value.error === undefined || typeof value.error === 'string');
}

export function isDatasetList(value: unknown): value is VisualizationDatasetView[] {
  return Array.isArray(value) && value.length <= MAX_DATASETS && value.every(isDataset);
}

export function isChartList(value: unknown): value is VisualizationChartRecord[] {
  return Array.isArray(value) && value.length <= MAX_CHARTS && value.every(isChart);
}
