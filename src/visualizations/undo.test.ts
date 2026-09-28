import { describe, expect, it } from 'vitest';
import { kept, snapshot, summaryOf } from './undo';
import type { VisualizationChartRecord, VisualizationTurnView } from './store';

// A snapshot is the expensive half of undo: it rides on a turn, the turn rides in a record, and the record
// is rewritten on every read — of which a chart on a ten-second interval is one every ten seconds. So what
// it may not carry is a table.

const TABLE = {
  columns: [{ name: 'region', type: 'string' as const }, { name: 'revenue', type: 'number' as const }],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

function chart(over: Partial<VisualizationChartRecord> = {}): VisualizationChartRecord {
  return {
    id: 'c1',
    data: { kind: 'source' },
    kind: 'bar',
    x: 'region',
    y: 'revenue',
    title: 'Revenue by region',
    refreshSeconds: 0,
    table: TABLE,
    transforms: [],
    ...over,
  } as unknown as VisualizationChartRecord;
}

describe('snapshot', () => {
  it('keeps what to draw and drops what was drawn', () => {
    const copy = snapshot([chart()]);
    expect(copy[0]).not.toHaveProperty('table');
    expect(copy[0]).toMatchObject({ id: 'c1', x: 'region', y: 'revenue', title: 'Revenue by region' });
  });

  it('copies the transforms, so a caller cannot hold one and watch it change', () => {
    const source = chart({ transforms: [{ op: 'limit', count: 3 }] });
    const copy = snapshot([source]);
    (copy[0]?.transforms as { count: number }[])[0] = { op: 'limit', count: 1 };
    expect(source.transforms).toEqual([{ op: 'limit', count: 3 }]);
  });
});

describe('summaryOf', () => {
  it('names a removal, a change and an addition, and nothing for no change', () => {
    expect(summaryOf([chart({ id: 'a', title: 'One' })], [])).toBe('removed "One"');
    expect(summaryOf([chart({ id: 'a', title: 'One' })], [chart({ id: 'a', title: 'One', y: 'other' })])).toBe('changed "One"');
    expect(summaryOf([], [chart({ id: 'a', title: 'One' })])).toBe('added "One"');
    expect(summaryOf([chart()], [chart()])).toBe('');
  });

  // "Just change the title" is a change the user asked for, and taking it back would be tedious.
  it('does not call a renamed chart a changed one', () => {
    expect(summaryOf([chart({ title: 'Before' })], [chart({ title: 'After' })])).toBe('');
  });

  it('joins two titles rather than making a sentence of them', () => {
    expect(summaryOf([chart({ id: 'a', title: 'One' }), chart({ id: 'b', title: 'Two' })], []))
      .toBe('removed "One" and "Two"');
  });
});

describe('kept', () => {
  it('keeps the most recent turns and drops the oldest', () => {
    const turn = (query: string): VisualizationTurnView => ({ query, response: 'done', pair: { harness: 'h', model: 'm' } });
    const fortyFive = Array.from({ length: 45 }, (_, index) => turn(`t${index}`));
    const result = kept(fortyFive);
    expect(result).toHaveLength(40);
    expect(result[0]?.query).toBe('t5');
  });
});
