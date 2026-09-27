import { describe, expect, it } from 'vitest';
import { AGGREGATES, validateChart } from './chart-spec.js';
import type { VisualizationChartView } from '../protocol/visualizations.js';
import type { Table } from './table.js';

const TABLE: Table = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'year', type: 'number' },
  ],
  rows: [['north', 10, 2025]],
};

const chart = (over: Partial<VisualizationChartView> = {}): VisualizationChartView => ({
  kind: 'bar', x: 'region', y: 'revenue', title: 'T', ...over,
});

describe('validateChart', () => {
  it('accepts a chart naming real columns with a numeric measure', () => {
    expect(validateChart(chart(), TABLE)).toEqual({ ok: true });
    expect(validateChart(chart({ kind: 'pie' }), TABLE)).toEqual({ ok: true });
    expect(validateChart(chart({ kind: 'scatter', x: 'revenue', y: 'year' }), TABLE)).toEqual({ ok: true });
  });

  // Every one of these is a model naming something the data does not have, and each is refused with a
  // reason the tab can show rather than stored and drawn as an empty plot area.
  it('refuses a column the table does not have, naming it', () => {
    expect(validateChart(chart({ x: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
    expect(validateChart(chart({ y: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
    expect(validateChart(chart({ series: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
  });

  it('refuses a measure that is not numeric', () => {
    expect(validateChart(chart({ y: 'region' }), TABLE))
      .toEqual({ error: '"region" is not a numeric column' });
  });

  it('refuses a pie with a numeric category', () => {
    expect(validateChart(chart({ kind: 'pie', x: 'revenue' }), TABLE))
      .toEqual({ error: 'a pie needs a category to slice, and "revenue" is numeric' });
  });

  it('refuses a chart when the source has not been read', () => {
    expect(validateChart(chart(), undefined)).toEqual({ error: 'the source has not been read yet' });
  });

  it('accepts each of the five aggregations', () => {
    for (const aggregate of AGGREGATES) {
      expect(validateChart(chart({ aggregate }), TABLE)).toEqual({ ok: true });
    }
  });

  // An unknown aggregate is refused rather than ignored. Ignored, the chart would draw successfully and
  // mean something other than what the model said, and the tab would say the number beside the bar was
  // a value when it was a total.
  it('refuses an aggregation the grammar does not have, naming it', () => {
    const rogue = { ...chart(), aggregate: 'median' } as unknown as VisualizationChartView;
    expect(validateChart(rogue, TABLE)).toEqual({ error: '"median" is not an aggregation' });
  });
});
