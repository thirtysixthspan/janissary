import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VISUALIZATION_SCHEMA_VERSION, VisualizationStore, type VisualizationRecord } from './store.js';

let home = '';
let warnings = '';

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janissary-viz-'));
  warnings = '';
  process.stderr.write = ((line: string) => { warnings += line; return true; }) as never;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function record(over: Partial<VisualizationRecord> = {}): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id: 'one',
    title: 'New visualization',
    createdAt: 1,
    updatedAt: 2,
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model' },
    refreshSeconds: 0,
    questions: [],
    turns: [],
    ...over,
  };
}

describe('VisualizationStore', () => {
  it('round-trips a record through write and read', () => {
    const store = new VisualizationStore({ home });
    store.write(record({ chart: { kind: 'bar', x: 'a', y: 'b', title: 'T' } }));
    expect(store.read('one')).toMatchObject({
      id: 'one',
      source: 'https://example.com/d.csv',
      chart: { kind: 'bar', x: 'a', y: 'b', title: 'T' },
    });
  });

  it('lists by most recent activity, and merges a written record into the list', () => {
    const store = new VisualizationStore({ home });
    store.write(record({ id: 'one', title: 'First', updatedAt: 100 }));
    store.write(record({ id: 'two', title: 'Second', updatedAt: 200 }));
    expect(store.list().map((entry) => entry.id)).toEqual(['two', 'one']);

    store.write(record({ id: 'one', title: 'Renamed', updatedAt: 300 }));
    expect(store.list().map((entry) => entry.title)).toEqual(['Renamed', 'Second']);
  });

  it('skips a directory whose document is missing or malformed, warns once, and leaves it alone', () => {
    const store = new VisualizationStore({ home });
    const broken = store.directory('broken');
    mkdirSync(broken, { recursive: true });
    writeFileSync(path.join(broken, 'visualization.json'), '{oops');

    expect(store.list()).toEqual([]);
    expect(warnings).toContain('visualization "broken" unavailable');
    expect(readFileSync(path.join(broken, 'visualization.json'), 'utf8')).toBe('{oops');

    store.list();
    expect(warnings.match(/unavailable/gu)).toHaveLength(1);
  });

  it('ignores a stray file at the top of the tree', () => {
    const store = new VisualizationStore({ home });
    mkdirSync(store.directory('one'), { recursive: true });
    writeFileSync(path.join(home, '.janissary', 'visualizations', 'stray.txt'), 'x');
    expect(store.list()).toEqual([]);
  });

  it('refuses an id that is not a plain word, before it can reach the filesystem', () => {
    const store = new VisualizationStore({ home });
    expect(() => store.read('../escape')).toThrow('Invalid visualization id.');
  });

  it('creates the workspace pair and the trust entry on ensure, idempotently', () => {
    const store = new VisualizationStore({ home });
    const workspace = store.ensure('one');
    expect(existsSync(workspace)).toBe(true);
    expect(existsSync(`${workspace}.tmp`)).toBe(true);

    expect(store.ensure('one')).toBe(workspace);
    const claude = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
      projects?: Record<string, unknown>;
    };
    expect(Object.keys(claude.projects ?? {})).toContain(workspace);
  });

  it('deletes one visualization whole, untrusting its workspace, and touches no other', () => {
    const store = new VisualizationStore({ home });
    store.write(record({ id: 'one' }));
    store.write(record({ id: 'two' }));
    const workspace = store.ensure('one');
    writeFileSync(path.join(workspace, 'marker'), 'x');

    store.delete('one');

    expect(store.read('one')).toBeUndefined();
    expect(store.read('two')).toMatchObject({ id: 'two' });
    const claude = JSON.parse(readFileSync(path.join(home, '.claude.json'), 'utf8')) as {
      projects?: Record<string, unknown>;
    };
    expect(Object.keys(claude.projects ?? {})).not.toContain(workspace);
  });

  it('survives a restart: a second store over the same home lists what the first wrote', () => {
    new VisualizationStore({ home }).write(record({ id: 'one', title: 'Kept' }));
    expect(new VisualizationStore({ home }).list()).toEqual([
      { id: 'one', title: 'Kept', updatedAt: 2 },
    ]);
  });

  it('leaves the previous document intact when a write fails', () => {
    const store = new VisualizationStore({ home });
    store.write(record({ id: 'one' }));
    const failing = new VisualizationStore({
      home,
      write: () => { throw new Error('disk full'); },
    });
    expect(() => failing.write(record({ id: 'one', title: 'Never' }))).toThrow('disk full');
    expect(store.read('one')?.title).toBe('New visualization');
  });
});
