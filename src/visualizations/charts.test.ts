import { describe, expect, it } from 'vitest';
import { chartViewOf } from './charts';
import type { VisualizationChartRecord } from './store';

const TABLE = {
  columns: [{ name: 'day', type: 'date' as const }, { name: 'latency', type: 'number' as const }],
  rows: [['2026-01-01', 100], ['2026-01-02', 104]],
  total: 2,
  truncated: false,
};

function chart(over: Partial<VisualizationChartRecord> = {}): VisualizationChartRecord {
  return {
    id: 'c1',
    data: { kind: 'source' },
    kind: 'bar',
    x: 'day',
    y: 'latency',
    title: 'Latency',
    refreshSeconds: 0,
    table: TABLE,
    transforms: [],
    ...over,
  } as unknown as VisualizationChartRecord;
}

// The seam the last three features were lost at. Every field here is optional, so a projection that named
// them one at a time satisfied its type and the compiler said nothing while a percentile chart was drawn
// at the median and a stacked chart was drawn side by side.
describe('chartViewOf', () => {
  it('carries the whole specification, including the three fields naming it one at a time would miss', () => {
    const view = chartViewOf(chart({
      aggregate: 'percentile',
      percentile: 95,
      xUnit: 'month',
      stack: 'normalize',
      series: 'service',
      metric: 'p95 latency',
    }));

    expect(view).toMatchObject({
      kind: 'bar', x: 'day', y: 'latency', title: 'Latency',
      aggregate: 'percentile', percentile: 95, xUnit: 'month', stack: 'normalize', series: 'service',
      metric: 'p95 latency', id: 'c1', refreshSeconds: 0,
    });
  });

  it('carries the transformations as words and not as the grammar', () => {
    const view = chartViewOf(chart({ transforms: [{ op: 'limit', count: 3 }] }));
    expect(view.notes).toEqual(['the first 3 categories']);
    expect(JSON.stringify(view)).not.toContain('"op"');
  });

  it('omits every optional field a chart did not state', () => {
    const view = chartViewOf(chart());
    expect(view).not.toHaveProperty('percentile');
    expect(view).not.toHaveProperty('xUnit');
    expect(view).not.toHaveProperty('stack');
    expect(view).not.toHaveProperty('metric');
    expect(view).not.toHaveProperty('readAt');
    expect(view).not.toHaveProperty('error');
  });

  it('copies the data reference rather than sharing it', () => {
    const source = chart({ data: { kind: 'file', path: 'a.json' } });
    const view = chartViewOf(source);
    expect(view.data).toEqual({ kind: 'file', path: 'a.json' });
    expect(view.data).not.toBe(source.data);
  });
});
