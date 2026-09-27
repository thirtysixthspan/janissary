import type { VisualizationAggregate, VisualizationChartView } from '../protocol/visualizations.js';
import type { Table } from './table.js';

// The one list of aggregates, imported by the store's guard and the prompt's parser rather than
// repeated in each, because a fourth copy is a fourth place for the three to disagree — and a
// disagreement here means a stored chart that draws a different number from the one it was asked for.
export const AGGREGATES: readonly VisualizationAggregate[] = ['sum', 'mean', 'count', 'min', 'max'];

export function isAggregate(value: unknown): value is VisualizationAggregate {
  return typeof value === 'string' && (AGGREGATES as readonly string[]).includes(value);
}

// The gate between a model's reply and a chart a user sees. A reply is a value produced by a system
// that was handed a sample of someone else's data, so it is checked against the real table before it
// is stored: a column it named has to exist, the measure has to be numeric, the aggregate has to be one
// of the five, and a pie has to have a category to slice. A spec that fails is refused with a reason
// the tab can show, and the caller records the model's own words instead of storing something unusable.
export function validateChart(
  chart: VisualizationChartView,
  table: Table | undefined,
): { error: string } | { ok: true } {
  if (!table) return { error: 'the source has not been read yet' };
  const x = table.columns.find((column) => column.name === chart.x);
  if (!x) return { error: `no column named "${chart.x}"` };
  const y = table.columns.find((column) => column.name === chart.y);
  if (!y) return { error: `no column named "${chart.y}"` };
  if (chart.series !== undefined && table.columns.every((column) => column.name !== chart.series)) {
    return { error: `no column named "${chart.series}"` };
  }
  if (y.type !== 'number') return { error: `"${chart.y}" is not a numeric column` };
  if (chart.aggregate !== undefined && !isAggregate(chart.aggregate)) {
    return { error: `"${chart.aggregate}" is not an aggregation` };
  }
  if (chart.kind === 'pie' && x.type === 'number') {
    return { error: `a pie needs a category to slice, and "${chart.x}" is numeric` };
  }
  return { ok: true };
}
