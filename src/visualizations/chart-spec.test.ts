import { describe, expect, it } from 'vitest';
import {
  AGGREGATES,
  CHART_KINDS,
  COMPARES,
  MAX_FILTER_VALUES,
  MAX_TRANSFORMS,
  chartSummary,
  datasetKey,
  isChartShape,
  isDataRef,
  isTransform,
  isTransformList,
  resolve,
  validateChart,
  type ChartSpec,
} from './chart-spec.js';
import type { VisualizationTableView } from '../protocol/visualizations.js';

const TABLE: VisualizationTableView = {
  columns: [
    { name: 'region', type: 'string' },
    { name: 'revenue', type: 'number' },
    { name: 'year', type: 'number' },
  ],
  rows: [['north', 10, 2025], ['south', 20, 2024]],
  total: 2,
  truncated: false,
};

const shape = (over: Partial<ChartSpec> = {}): ChartSpec => ({
  data: { kind: 'source' },
  transforms: [],
  kind: 'bar',
  x: 'region',
  y: 'revenue',
  title: 'T',
  ...over,
});

describe('validateChart', () => {
  it('accepts a chart naming real columns with a numeric measure', () => {
    expect(validateChart(shape(), TABLE)).toEqual({ ok: true });
    expect(validateChart(shape({ kind: 'pie' }), TABLE)).toEqual({ ok: true });
    expect(validateChart(shape({ kind: 'scatter', x: 'revenue', y: 'year' }), TABLE)).toEqual({ ok: true });
  });

  // Every one of these is a model naming something the data does not have, and each is refused with a
  // reason the chat can show rather than stored and drawn as an empty plot area.
  it('refuses a column the table does not have, naming it', () => {
    expect(validateChart(shape({ x: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
    expect(validateChart(shape({ y: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
    expect(validateChart(shape({ series: 'nope' }), TABLE)).toEqual({ error: 'no column named "nope"' });
  });

  it('refuses a measure that is not numeric', () => {
    expect(validateChart(shape({ y: 'region' }), TABLE))
      .toEqual({ error: '"region" is not a numeric column' });
  });

  it('refuses a pie with a numeric category', () => {
    expect(validateChart(shape({ kind: 'pie', x: 'revenue' }), TABLE))
      .toEqual({ error: 'a pie needs a category to slice, and "revenue" is numeric' });
  });

  it('accepts each of the five aggregations', () => {
    for (const aggregate of AGGREGATES) {
      expect(validateChart(shape({ aggregate }), TABLE)).toEqual({ ok: true });
    }
  });
});

describe('resolve', () => {
  it('refuses a chart when there is no data to draw from', () => {
    expect(resolve(undefined, shape())).toEqual({ error: 'there is no data to draw from yet' });
  });

  it('resolves a chart with no transformations to the table it was given', () => {
    const resolved = resolve(TABLE, shape());
    expect(resolved).toEqual({ table: TABLE });
  });

  // Checked against the transformed table, not the raw one, so a column the transformations added is a
  // column the chart may plot.
  it('accepts a chart that plots a derived column', () => {
    const resolved = resolve(TABLE, shape({
      x: 'year',
      y: 'per region',
      transforms: [{ op: 'derive', name: 'per region', expression: 'revenue / 2' }],
    }));
    expect('error' in resolved).toBe(false);
  });

  it('refuses a chart that plots a derived column without deriving it', () => {
    const resolved = resolve(TABLE, shape({ y: 'per region' }));
    expect(resolved).toEqual({ error: 'no column named "per region"' });
  });

  // The two counts exist so a cropped picture can say it is cropped. A limit of one over a source of
  // nine is exactly the case the caption's "showing 1 of 9 rows" was written for, and the old
  // assignment made total === rows.length in every case, so the caption could never reach that branch.
  it('keeps the source\'s own total beside the rows the transformations left', () => {
    const resolved = resolve({ ...TABLE, total: 9, truncated: true }, shape({
      transforms: [{ op: 'limit', count: 1 }],
    }));
    expect(resolved).toEqual({ table: { ...TABLE, rows: [TABLE.rows[0]], total: 9, truncated: true } });
  });

  it('reports a complete source as complete', () => {
    const resolved = resolve(TABLE, shape());
    expect(resolved).toEqual({ table: { ...TABLE, total: TABLE.rows.length, truncated: false } });
  });
});

describe('isDataRef', () => {
  it('accepts the source and a named file', () => {
    expect(isDataRef({ kind: 'source' })).toBe(true);
    expect(isDataRef({ kind: 'file', path: 'data.json' })).toBe(true);
  });

  it('refuses a file with no path, an unknown kind, and a non-object', () => {
    expect(isDataRef({ kind: 'file' })).toBe(false);
    expect(isDataRef({ kind: 'url', source: 'https://example.com' })).toBe(false);
    expect(isDataRef(null)).toBe(false);
    expect(isDataRef([])).toBe(false);
  });

  it('keys a data reference the way a dataset is stored', () => {
    expect(datasetKey({ kind: 'source' })).toBe('source');
    expect(datasetKey({ kind: 'file', path: 'out/data.json' })).toBe('out/data.json');
  });
});

describe('isTransform', () => {
  it('accepts each comparison', () => {
    for (const compare of COMPARES) {
      const step = compare === 'in'
        ? { op: 'filter', column: 'c', compare, values: [1] }
        : { op: 'filter', column: 'c', compare, value: 1 };
      expect(isTransform(step)).toBe(true);
    }
  });

  it('refuses a filter with an unknown comparison', () => {
    expect(isTransform({ op: 'filter', column: 'c', compare: 'like', value: 1 })).toBe(false);
  });

  it('refuses a list beside a single-value comparison, and a list with an in', () => {
    expect(isTransform({ op: 'filter', column: 'c', compare: 'eq', value: 1, values: [1] })).toBe(false);
    expect(isTransform({ op: 'filter', column: 'c', compare: 'in', value: 1 })).toBe(false);
  });

  it('refuses a value list past its bound', () => {
    const values = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, index) => index);
    expect(isTransform({ op: 'filter', column: 'c', compare: 'in', values })).toBe(false);
  });

  it('accepts a derive, a sort and a limit, and refuses a malformed one of each', () => {
    expect(isTransform({ op: 'derive', name: 'a', expression: 'b / 2' })).toBe(true);
    expect(isTransform({ op: 'derive', name: '', expression: 'b / 2' })).toBe(false);
    expect(isTransform({ op: 'derive', name: 'a', expression: '  ' })).toBe(false);
    expect(isTransform({ op: 'sort', column: 'a', direction: 'asc' })).toBe(true);
    expect(isTransform({ op: 'sort', column: 'a', direction: 'sideways' })).toBe(false);
    expect(isTransform({ op: 'limit', count: 3 })).toBe(true);
    expect(isTransform({ op: 'limit', count: 0 })).toBe(false);
    expect(isTransform({ op: 'limit', count: 1.5 })).toBe(false);
  });

  it('refuses an operation the vocabulary does not have', () => {
    expect(isTransform({ op: 'pivot', column: 'a' })).toBe(false);
  });

  it('refuses a step list past its bound', () => {
    const step = { op: 'limit', count: 1 };
    expect(isTransformList(Array.from({ length: MAX_TRANSFORMS }, () => step))).toBe(true);
    expect(isTransformList(Array.from({ length: MAX_TRANSFORMS + 1 }, () => step))).toBe(false);
  });
});

describe('isChartShape', () => {
  it('accepts each of the five kinds', () => {
    for (const kind of CHART_KINDS) {
      expect(isChartShape({ kind, x: 'a', y: 'b', title: 'T' })).toBe(true);
    }
  });

  it('refuses a specification missing any required field', () => {
    expect(isChartShape({ x: 'a', y: 'b', title: 'T' })).toBe(false);
    expect(isChartShape({ kind: 'bar', y: 'b', title: 'T' })).toBe(false);
    expect(isChartShape({ kind: 'bar', x: 'a', title: 'T' })).toBe(false);
    expect(isChartShape({ kind: 'bar', x: 'a', y: 'b' })).toBe(false);
    expect(isChartShape({ kind: 'bar', x: '', y: 'b', title: 'T' })).toBe(false);
    expect(isChartShape({ kind: 'bar', x: 'a', y: 'b', title: '  ' })).toBe(false);
  });

  it('refuses an aggregation the grammar does not have rather than dropping it', () => {
    expect(isChartShape({ kind: 'bar', x: 'a', y: 'b', title: 'T', aggregate: 'median' })).toBe(false);
  });
});

describe('chartSummary', () => {
  it('says what the chart is now', () => {
    expect(chartSummary(shape({ kind: 'line' }))).toBe('Now a line chart of revenue by region.');
  });

  it('names the split and the reduction', () => {
    expect(chartSummary(shape({ series: 'year', aggregate: 'sum' })))
      .toBe('Now a bar chart of revenue by region, split by year, summed.');
  });

  it('names the transformations, because a chart that transforms and does not say so lies', () => {
    expect(chartSummary(shape({ transforms: [{ op: 'filter', column: 'year', compare: 'eq', value: 2024 }] })))
      .toContain("only year eq '2024'");
  });
});
