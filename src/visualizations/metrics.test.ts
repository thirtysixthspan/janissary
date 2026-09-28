import { describe, expect, it } from 'vitest';
import { findMetric, isMetricList, isMetricName, metricList, metricOf, remembered, resolveMetric } from './metrics';
import type { VisualizationMetric } from '../protocol';

// A metric is the one thing in this feature that exists to be wrong quietly, so every case here is about
// a definition that cannot be believed: a name matching two of them, a column that is not there, a name
// that means something different in two charts.

const P95: VisualizationMetric = {
  name: 'p95 latency',
  y: 'latency',
  aggregate: 'percentile',
  percentile: 95,
  notes: 'the number a user feels',
  synonyms: ['p95', 'the slow number'],
};

const always = (): boolean => true;

describe('isMetricName', () => {
  it('takes a name a person can type and read back', () => {
    expect(isMetricName('p95 latency')).toBe(true);
    expect(isMetricName('errors / deploys')).toBe(true);
  });

  it('refuses a name that would be awkward in a caption or a sentence', () => {
    expect(isMetricName('')).toBe(false);
    expect(isMetricName(' '.repeat(3))).toBe(false);
    expect(isMetricName('(p95)')).toBe(false);
    expect(isMetricName('p95\nlatency')).toBe(false);
    expect(isMetricName('x'.repeat(49))).toBe(false);
  });

  // A stray space is not a different name: a user typing one by hand should reach the definition, and
  // trimming is what makes a stored name and a typed one the same string.
  it('trims a name rather than refusing it for its spacing', () => {
    expect(isMetricName('  p95 latency  ')).toBe(true);
  });
});

describe('metricOf', () => {
  it('reads a definition, trimming and keeping only what was stated', () => {
    expect(metricOf({ name: '  revenue  ', y: 'revenue', aggregate: 'sum', synonyms: ['  turnover  '] }))
      .toEqual({ name: 'revenue', y: 'revenue', aggregate: 'sum', synonyms: ['turnover'] });
  });

  it('drops a synonym list that is not a list of names', () => {
    expect(metricOf({ name: 'revenue', y: 'revenue', synonyms: [1] })).toBeUndefined();
    expect(metricOf({ name: 'revenue', y: 'revenue', synonyms: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toBeUndefined();
  });

  it('refuses a definition the grammar could not use', () => {
    expect(metricOf({ name: 'revenue', y: 'revenue', aggregate: 'geommedian' })).toBeUndefined();
    expect(metricOf({ name: 'revenue' })).toBeUndefined();
  });
});

describe('findMetric', () => {
  it('matches without regard to case, because a user typing a name will not match its capitalisation', () => {
    expect(findMetric([P95], 'P95 Latency')).toBe(P95);
    expect(findMetric([P95], '  p95 latency  ')).toBe(P95);
  });

  it('finds nothing rather than something close', () => {
    expect(findMetric([P95], 'p99 latency')).toBeUndefined();
  });
});

describe('resolveMetric', () => {
  it('resolves a name to the column and the reduction behind it', () => {
    expect(resolveMetric([P95], 'p95 latency', always)).toEqual({ metric: P95 });
  });

  // The refusal that matters: an unknown name falling back to a column would draw a chart that succeeds
  // and means something else, which is the one failure a chart cannot make.
  it('refuses an unknown name rather than drawing something else', () => {
    expect(resolveMetric([P95], 'p99 latency', always))
      .toEqual({ error: 'there is no measure named "p99 latency", and defining one is a reply away' });
  });

  it('refuses a measure whose column this data does not have', () => {
    expect(resolveMetric([P95], 'p95 latency', (column) => column !== 'latency'))
      .toEqual({ error: 'the measure "p95 latency" is a column named "latency", which this data does not have' });
  });
});

describe('remembered', () => {
  it('replaces a definition of the same name rather than holding two', () => {
    const record = { metrics: [P95] };
    remembered(record, [{ name: 'P95 LATENCY', y: 'latency', aggregate: 'percentile', percentile: 99 }]);
    expect(record.metrics).toEqual([{ name: 'P95 LATENCY', y: 'latency', aggregate: 'percentile', percentile: 99 }]);
  });

  // A measure the user typed is the one they will ask for again, so a reply that brings a dozen of its
  // own cannot empty it. `slice(-MAX_METRICS)` over the combined list dropped the oldest entry overall,
  // which is the user's, and nothing said so.
  it('keeps the measures the user named when a reply brings twelve of its own', () => {
    const record = { metrics: [P95] };
    const twelve = Array.from({ length: 12 }, (_, index) => ({ name: `m${index}`, y: 'revenue', aggregate: 'sum' as const }));

    const dropped = remembered(record, twelve);

    expect(record.metrics.map((one) => one.name)).toContain('p95 latency');
    expect(record.metrics).toHaveLength(12);
    // The oldest of the incoming definitions is what goes, and which ones went is returned so the turn
    // can say so rather than the measure disappearing without a word.
    expect(record.metrics.map((one) => one.name)).not.toContain('m0');
    expect(dropped).toEqual(['m0']);
  });

  // A reply that corrects a measure the user named still wins, which is the case the preference above
  // must not swallow: the old definition is replaced, not protected.
  it('still lets a reply correct a measure the user named', () => {
    const record = { metrics: [P95] };
    const twelve = Array.from({ length: 12 }, (_, index) => ({ name: `m${index}`, y: 'revenue', aggregate: 'sum' as const }));

    remembered(record, [{ name: 'P95 Latency', y: 'latency', aggregate: 'percentile', percentile: 99 }, ...twelve]);

    expect(record.metrics.filter((one) => one.name.toLowerCase() === 'p95 latency')).toEqual([
      { name: 'P95 Latency', y: 'latency', aggregate: 'percentile', percentile: 99 },
    ]);
  });

  it('keeps the ones this reply said nothing about', () => {
    const record = { metrics: [P95, { name: 'errors', y: 'errors', aggregate: 'sum' }] };
    remembered(record, [{ name: 'deploys', y: 'deploys', aggregate: 'count' }]);
    expect(record.metrics.map((one) => one.name)).toEqual(['p95 latency', 'errors', 'deploys']);
  });
});

describe('isMetricList', () => {
  it('takes a list of definitions the store can read back', () => {
    expect(isMetricList([P95])).toBe(true);
    expect(isMetricList([])).toBe(true);
  });

  it('refuses two definitions answering to one name', () => {
    expect(isMetricList([P95, { name: 'P95 Latency', y: 'latency' }])).toBe(false);
  });

  it('refuses a list longer than the bound and one holding a definition it cannot read', () => {
    const many = Array.from({ length: 13 }, (_, index) => ({ name: `m${index}`, y: 'y' }));
    expect(isMetricList(many)).toBe(false);
    expect(isMetricList([{ name: 'm', y: 'y', aggregate: 'nope' }])).toBe(false);
    expect(isMetricList([{ name: 'm' }])).toBe(false);
  });
});

describe('metricList', () => {
  it('says the name, the reduction and the other words for it', () => {
    expect(metricList([P95], always)).toEqual([
      '- p95 latency: percentile 95 of latency (also called p95, the slow number) — the number a user feels',
    ]);
  });

  it('leaves out a definition whose column the data does not have', () => {
    // A prompt offering a name that cannot be drawn is a prompt inviting a refusal.
    expect(metricList([P95], (column) => column === 'revenue')).toEqual([]);
  });

  it('says a measure with no aggregate as the column itself', () => {
    expect(metricList([{ name: 'regions', y: 'region', aggregate: 'distinct' }], always))
      .toEqual(['- regions: distinct of region']);
  });
});
