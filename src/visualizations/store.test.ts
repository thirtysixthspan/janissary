import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VisualizationStore,
  freshVisualization,
  isEmptyRecord,
  isVisualizationRecord,
  VISUALIZATION_SCHEMA_VERSION,
} from './store.js';

let home = '';

const TABLE = {
  columns: [
    { name: 'region', type: 'string' as const },
    { name: 'revenue', type: 'number' as const },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

const PAIR = { harness: 'opencode' as const, model: 'model' };

function record(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id: 'one',
    title: 'Revenue by region',
    createdAt: 1,
    updatedAt: 2,
    source: 'https://example.com/d.csv',
    pair: PAIR,
    datasets: [{ key: 'source', table: TABLE, readAt: 1 }],
    charts: [{
      id: 'c1',
      data: { kind: 'source' },
      transforms: [{ op: 'filter', column: 'year', compare: 'eq', value: 2024 }],
      refreshSeconds: 30,
      readAt: 1,
      table: TABLE,
      kind: 'bar',
      x: 'region',
      y: 'revenue',
      title: 'Revenue by region',
    }],
    turns: [{ query: 'go', response: 'done', pair: PAIR }],
    ...over,
  };
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janissary-viz-store-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('a stored visualization', () => {
  it('round-trips a record with its datasets, charts and transformations', () => {
    const store = new VisualizationStore({ home });
    const value = record();
    store.write(value as never);

    const read = store.read('one');

    expect(read?.source).toBe('https://example.com/d.csv');
    expect(read?.datasets[0]?.table?.rows).toHaveLength(2);
    expect(read?.charts[0]?.transforms).toEqual([{ op: 'filter', column: 'year', compare: 'eq', value: 2024 }]);
    expect(read?.charts[0]?.table.rows).toHaveLength(2);
  });

  it('round-trips a record holding no document and a chart holding an error', () => {
    const store = new VisualizationStore({ home });
    store.write(record({
      datasets: [{ key: 'source', error: 'returned 500' }],
      charts: [{ ...(record().charts as Record<string, unknown>[])[0], error: 'returned 500', readAt: undefined }],
    }) as never);

    const read = store.read('one');

    expect(read?.datasets[0]?.error).toBe('returned 500');
    expect(read?.charts[0]?.error).toBe('returned 500');
    expect(read?.charts[0]?.readAt).toBeUndefined();
  });

  it('refuses a document of an older schema rather than reading it as this one', () => {
    const store = new VisualizationStore({ home });
    mkdirSync(path.join(home, '.janissary', 'visualizations', 'one'), { recursive: true });
    writeFileSync(
      path.join(home, '.janissary', 'visualizations', 'one', 'visualization.json'),
      JSON.stringify(record({ schemaVersion: 1, questions: [] })),
    );
    const warn = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(store.list()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('refuses a malformed document and leaves it on disk', () => {
    const store = new VisualizationStore({ home });
    const directory = path.join(home, '.janissary', 'visualizations', 'broken');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'visualization.json'), 'not json');
    const warn = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    expect(store.list()).toEqual([]);

    expect(existsSync(path.join(directory, 'visualization.json'))).toBe(true);
    warn.mockRestore();
  });

  it('ignores a stray file at the top of the tree', () => {
    const store = new VisualizationStore({ home });
    mkdirSync(path.join(home, '.janissary', 'visualizations'), { recursive: true });
    writeFileSync(path.join(home, '.janissary', 'visualizations', 'notes.txt'), 'hello');
    expect(store.list()).toEqual([]);
  });

  it('leaves the previous document intact when a write fails', () => {
    const store = new VisualizationStore({ home });
    store.write(record() as never);
    const failing = new VisualizationStore({
      home,
      write: () => { throw new Error('disk full'); },
    });

    expect(() => failing.write(record({ title: 'Second' }) as never)).toThrow('disk full');
    expect(store.read('one')?.title).toBe('Revenue by region');
  });

  it('refuses an id that is not an id', () => {
    const store = new VisualizationStore({ home });
    expect(() => store.read('../escape')).toThrow('Invalid visualization id.');
  });

  // A record persisted mid-reply has a streaming turn on it, and refusing that would delete the whole
  // visualization the moment the process exits during a model call.
  it('reads back a record whose turn was left streaming', () => {
    const store = new VisualizationStore({ home });
    store.write(record({
      turns: [{ query: 'go', response: '', pair: PAIR, streaming: true }],
    }) as never);
    expect(store.read('one')?.turns[0]?.streaming).toBe(true);
  });

  it('refuses a record whose charts are not charts', () => {
    expect(isVisualizationRecord(record({ charts: [{ id: 'c1' }] }))).toBe(false);
    expect(isVisualizationRecord(record({ charts: [{ ...(record().charts as never[])[0], transforms: 'none' }] }))).toBe(false);
    expect(isVisualizationRecord(record({ datasets: 'none' }))).toBe(false);
    expect(isVisualizationRecord(record({ turns: [{ query: 'go' }] }))).toBe(false);
    expect(isVisualizationRecord(record())).toBe(true);
  });

  it('reads a document it wrote through a second store over the same home', () => {
    new VisualizationStore({ home }).write(record({ id: 'one', updatedAt: 5 }) as never);
    expect(new VisualizationStore({ home }).list()).toEqual([
      { id: 'one', title: 'Revenue by region', updatedAt: 5 },
    ]);
  });
});

describe('the workspace pair', () => {
  it('creates the workspace and its private temp directory, and is idempotent', () => {
    const store = new VisualizationStore({ home });
    const first = store.ensure('one');
    const second = store.ensure('one');
    expect(second).toBe(first);
    expect(existsSync(path.join(first, '..', 'workspace.tmp'))).toBe(true);
  });

  it('untrusts the workspace and removes one visualization, touching no other', () => {
    const store = new VisualizationStore({ home });
    store.write(record() as never);
    store.write(record({ id: 'two' }) as never);
    store.ensure('one');

    store.delete('one');

    expect(existsSync(path.join(home, '.janissary', 'visualizations', 'one'))).toBe(false);
    expect(existsSync(path.join(home, '.janissary', 'visualizations', 'two', 'visualization.json'))).toBe(true);
  });
});

describe('a record nobody has started', () => {
  it('is empty, and empty is what keeps it off the disk and out of the index', () => {
    const fresh = freshVisualization('one', PAIR, 1);
    expect(isEmptyRecord(fresh)).toBe(true);
    expect(isVisualizationRecord(fresh)).toBe(true);
  });

  it('is no longer empty once a source is named', () => {
    expect(isEmptyRecord(freshVisualization('one', PAIR, 1))).toBe(true);
    expect(isEmptyRecord({ ...freshVisualization('one', PAIR, 1), source: 'https://x' })).toBe(false);
  });

  it('reads back the same document the store wrote', () => {
    const store = new VisualizationStore({ home });
    store.write(freshVisualization('one', PAIR, 1));
    expect(readFileSync(path.join(home, '.janissary', 'visualizations', 'one', 'visualization.json'), 'utf8'))
      .toContain('"schemaVersion": 2');
  });
});
