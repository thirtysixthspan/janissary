import { describe, expect, it } from 'vitest';
import { reverted } from './undo';
import type { VisualizationChartRecord, VisualizationChartSpec, VisualizationRecord, VisualizationTurnView } from '../protocol';

// Two turns can carry the same sentence - re-sent, or clicked twice from a re-offered row - so a turn is
// named by where it sits. These cases are about which turn comes back when, and the states are small
// enough to read: two charts before, none between, and what each turn is able to restore.

const SOURCE = 'source';

function chart(id: string, title: string, table: unknown): VisualizationChartRecord {
  return {
    id, data: { kind: 'source' }, kind: 'bar', x: 'region', y: 'revenue', title,
    refreshSeconds: 0, table, transforms: [],
  } as unknown as VisualizationChartRecord;
}

// What a snapshot carries: the chart without the table it was drawn from.
function specified(one: VisualizationChartRecord): VisualizationChartSpec {
  const rest: Record<string, unknown> = { ...one };
  delete rest.table;
  delete rest.readAt;
  return rest as unknown as VisualizationChartSpec;
}

function turn(query: string, before: VisualizationChartSpec[] | undefined, undo: string | undefined): VisualizationTurnView {
  return {
    query,
    response: 'done',
    pair: { harness: 'h', model: 'm' },
    ...(before !== undefined && { before }),
    ...(undo !== undefined && { undo }),
  };
}

const TABLE = {
  columns: [{ name: 'region', type: 'string' }, { name: 'revenue', type: 'number' }],
  rows: [['north', 10]],
  total: 1,
  truncated: false,
};

// The source the charts name is in the record, because a restored chart is resolved against it rather
// than against whatever the snapshot happened to carry.
function recordOf(charts: VisualizationChartRecord[], turns: VisualizationTurnView[]): VisualizationRecord {
  return { charts, turns, datasets: [{ key: SOURCE, table: TABLE, readAt: 1_700_000_000_000 }] } as unknown as VisualizationRecord;
}

describe('reverted', () => {
  // Undoing under the second of two identical turns must not restore the state before the first: that
  // would take back both charts, consume the first turn's undo and leave the second button lit over a
  // state that was never on screen.
  it('takes back the turn whose position it was given, not the first with that text', () => {
    const first = chart('c1', 'By region', TABLE);
    const second = chart('c2', 'By service', TABLE);
    const record = recordOf(
      [first, second],
      [
        turn('plot revenue by region', [], 'added "By region"'),
        turn('plot revenue by region', [specified(first)], 'removed "By service"'),
      ],
    );

    expect(reverted(record, 1)).toBe(true);

    // Before the second turn there was only the first chart, so that is what the turn restores; the
    // first turn, which made the same claim with a different answer, is left alone.
    expect(record.charts.map((one) => one.id)).toEqual(['c1']);
    expect(record.turns[0]?.undo).toBe('added "By region"');
    expect(record.turns[1]?.undo).toBeUndefined();
  });

  it('refuses a position the record does not hold, and one already taken back', () => {
    const one = chart('c1', 'By region', TABLE);
    const record = recordOf([one], [turn('plot revenue by region', [], 'removed "By region"')]);

    expect(reverted(record, 4)).toBe(false);
    expect(reverted(record, 1)).toBe(false);
    expect(record.charts).toHaveLength(1);

    expect(reverted(record, 0)).toBe(true);
    expect(reverted(record, 0)).toBe(false);
  });

  // A snapshot is what to draw rather than what was drawn, so a chart taken back is resolved again from
  // the data its own specification names. If the snapshot's table came back with it, this chart would
  // show rows from whenever the snapshot was taken instead of the rows on the screen now.
  it('draws a restored chart from the data it names, not from a copy of a table', () => {
    const fresh = { ...TABLE, rows: [['south', 99]] };
    const record = recordOf([], [turn('go', [specified(chart('c1', 'By region', TABLE))], 'added "By region"')]);
    record.datasets = [{ key: SOURCE, table: fresh, readAt: 1_800_000_000_000 }] as unknown as VisualizationRecord['datasets'];

    expect(reverted(record, 0)).toBe(true);

    const restored = record.charts[0];
    expect(restored?.table.rows).toEqual([['south', 99]]);
    expect(restored?.readAt).toBeDefined();
  });
});
