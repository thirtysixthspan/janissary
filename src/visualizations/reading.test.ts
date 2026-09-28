import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { acquire, readWorkspaceFile, reader } from './reading.js';
import { drawn } from './charts.js';
import { VisualizationIndex } from './index.js';
import { VisualizationStore, VISUALIZATION_SCHEMA_VERSION, type VisualizationRecord } from './store.js';

let home = '';
let workspace = '';

const TABLE = {
  columns: [
    { name: 'region', type: 'string' as const },
    { name: 'revenue', type: 'number' as const },
  ],
  rows: [['north', 10], ['south', 4]],
  total: 2,
  truncated: false,
};

function record(over: Partial<VisualizationRecord> = {}): VisualizationRecord {
  return {
    schemaVersion: VISUALIZATION_SCHEMA_VERSION,
    id: 'one',
    title: 'New visualization',
    createdAt: 1,
    updatedAt: 1,
    source: 'https://example.com/d.csv',
    pair: { harness: 'opencode', model: 'model' },
    datasets: [{ key: 'source' }],
    charts: [],
    metrics: [],
    instructions: [],
    turns: [],
    ...over,
  };
}

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'janissary-viz-read-'));
  workspace = path.join(home, 'workspace');
  mkdirSync(workspace, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('readWorkspaceFile', () => {
  it('reads a file the agent wrote inside its own workspace', () => {
    writeFileSync(path.join(workspace, 'data.json'), 'region,revenue\nnorth,10\n');
    expect(readWorkspaceFile(workspace, 'data.json')).toEqual({ text: 'region,revenue\nnorth,10\n' });
  });

  it('reads a file in a directory it made inside the workspace', () => {
    mkdirSync(path.join(workspace, 'out'), { recursive: true });
    writeFileSync(path.join(workspace, 'out', 'data.csv'), 'a\n1\n');
    expect(readWorkspaceFile(workspace, 'out/data.csv')).toEqual({ text: 'a\n1\n' });
  });

  // The agent names the file; it does not get to name a path. A `..` that resolved out of the workspace
  // would make the source roots a suggestion rather than a boundary, and this is where it is caught.
  it('refuses a path that resolves outside the workspace', () => {
    expect(readWorkspaceFile(workspace, '../secrets.json'))
      .toEqual({ error: '"../secrets.json" is outside the visualization\'s own workspace' });
    expect(readWorkspaceFile(workspace, '/etc/hosts'))
      .toEqual({ error: '"/etc/hosts" is outside the visualization\'s own workspace' });
  });

  // The agent can run commands inside its workspace, so it can create a link there. A containment check
  // that is purely lexical lets `ln -s ~/.aws/credentials data.json` through, and the unsandboxed host
  // then reads the target and hands it to the model in the next prompt.
  it('refuses a link inside the workspace that points outside it', () => {
    const outside = path.join(home, 'outside.json');
    writeFileSync(outside, 'region,revenue\nnorth,10\n');
    symlinkSync(outside, path.join(workspace, 'data.json'));

    const result = readWorkspaceFile(workspace, 'data.json');

    expect(result).toEqual({ error: '"data.json" resolves outside the visualization\'s own workspace' });
  });

  it('reads a link that points back inside the workspace', () => {
    writeFileSync(path.join(workspace, 'real.json'), 'region,revenue\nnorth,10\n');
    symlinkSync(path.join(workspace, 'real.json'), path.join(workspace, 'data.json'));

    expect(readWorkspaceFile(workspace, 'data.json')).toEqual({ text: 'region,revenue\nnorth,10\n' });
  });

  it('refuses anything that is not a regular file', () => {
    mkdirSync(path.join(workspace, 'out'), { recursive: true });
    expect(readWorkspaceFile(workspace, 'out')).toEqual({ error: 'out is not a file' });
  });

  it('refuses a file past the size cap rather than slurping it', () => {
    writeFileSync(path.join(workspace, 'big.json'), 'x'.repeat(8 * 1024 * 1024 + 1));
    const result = readWorkspaceFile(workspace, 'big.json');
    expect(result).toHaveProperty('error');
    expect(String((result as { error: string }).error)).toContain('byte limit');
  });

  it('reports a missing workspace rather than throwing at the caller', () => {
    expect(readWorkspaceFile(path.join(home, 'gone'), 'data.json'))
      .toHaveProperty('error');
  });

  it('reports a file that is not there rather than throwing', () => {
    const result = readWorkspaceFile(workspace, 'nope.json');
    expect(result).toHaveProperty('error');
  });
});

function harness(subject: VisualizationRecord, read: (source: string) => Promise<{ text: string } | { error: string }>) {
  const store = new VisualizationStore({ home });
  const index = new VisualizationIndex(store);
  index.remember(subject);
  const commits: { error?: string }[] = [];
  const readOne = reader({
    read,
    workspace: () => workspace,
    index,
    now: () => 9,
    commit: (_record, error) => { commits.push(error === undefined ? {} : { error }); },
  });
  return { readOne, commits, index };
}

describe('reading a dataset', () => {
  // The store's own guard refuses to read back a record holding more datasets than it allows, so a ninth
  // would not merely be wasted: the whole record would become unreadable and the visualization would
  // vanish from the index with nothing but a warning to say so. The ceiling is therefore checked before
  // the read rather than after it.
  it('reads nothing for a ninth source', () => {
    const subject = record({
      datasets: [{ key: 'source' }, ...Array.from({ length: 7 }, (_, index) => ({ key: `d${index}.json` }))],
    });

    const dataset = acquire(subject, { kind: 'file', path: 'new.json' }, workspace, 9);

    expect(dataset).toBeUndefined();
    expect(subject.datasets).toHaveLength(8);
  });

  it('stores the table it found and the time it was read', async () => {
    const subject = record();
    const { readOne, commits } = harness(subject, async () => ({ text: 'region,revenue\nnorth,10\nsouth,4\n' }));

    const dataset = await readOne('one', { kind: 'source' });

    expect(dataset?.table?.rows).toHaveLength(2);
    expect(dataset?.readAt).toBe(9);
    expect(dataset?.error).toBeUndefined();
    expect(commits).toHaveLength(1);
  });

  // A page describing an API is not a failed table, and reporting "no numeric column to measure" to
  // someone who pointed at their own documentation is a message about the wrong thing.
  it('keeps a body that is a page as a document rather than a failure', async () => {
    const subject = record();
    const page = '<html><body>Revenue API. GET /sales?year=</body></html>';
    const { readOne } = harness(subject, async () => ({ text: page }));

    const dataset = await readOne('one', { kind: 'source' });

    expect(dataset?.table).toBeUndefined();
    expect(dataset?.document).toBe(page);
    expect(dataset?.error).toBeUndefined();
  });

  it('records a read that failed and leaves what was there', async () => {
    const subject = record({ datasets: [{ key: 'source', table: TABLE, readAt: 1 }] });
    const { readOne, commits } = harness(subject, async () => ({ error: 'returned 500' }));

    const dataset = await readOne('one', { kind: 'source' });

    expect(dataset?.error).toBe('returned 500');
    expect(dataset?.table).toBe(TABLE);
    // The attempt is stamped even though it failed, because the poll measures its next wait from when a
    // dataset was last read rather than from when it last succeeded.
    expect(dataset?.readAt).toBe(9);
    expect(commits[0]?.error).toBeUndefined();
  });

  it('drops a read already in flight rather than queueing a second', async () => {
    const subject = record();
    const gate = Promise.withResolvers<void>();
    const { readOne } = harness(subject, async () => {
      await gate.promise;
      return { text: 'region,revenue\nnorth,10\n' };
    });

    const first = readOne('one', { kind: 'source' });
    const second = await readOne('one', { kind: 'source' });
    expect(second).toBeUndefined();
    gate.resolve();
    await first;
    expect(subject.datasets[0]?.table).toBeDefined();
  });

  // A read that throws is a read that failed. Before, the throw skipped the delete of the in-flight mark
  // and the key stayed for the life of the process, so every later read of that dataset was dropped at
  // the check above with no error anywhere and the poll still re-arming: a chart that has stopped
  // updating for good, with nothing on screen to say so. The second read here is the one that matters.
  it('releases the in-flight mark when a read throws, and records why', async () => {
    const subject = record({ datasets: [{ key: 'source', table: TABLE, readAt: 1 }] });
    const store = new VisualizationStore({ home });
    const index = new VisualizationIndex(store);
    index.remember(subject);
    let attempts = 0;
    const readOne = reader({
      read: async () => {
        attempts += 1;
        throw new Error('socket hang up');
      },
      workspace: () => workspace,
      index,
      now: () => 9,
      commit: () => {},
    });

    const first = await readOne('one', { kind: 'source' });

    // The reason is on the dataset rather than in a rejection, because nothing is awaiting this promise
    // and an unhandled rejection says nothing about which chart or which source it belonged to.
    expect(first?.error).toBe('the read failed: socket hang up');
    expect(first?.table).toBe(TABLE);
    await readOne('one', { kind: 'source' });
    expect(attempts).toBe(2);
  });

  it('reads a file the agent wrote, and refuses one it did not', async () => {
    writeFileSync(path.join(workspace, 'data.json'), '[{"region":"north","revenue":10}]');
    const subject = record({ datasets: [{ key: 'data.json', table: TABLE }] });
    const { readOne } = harness(subject, async () => ({ text: '' }));

    const dataset = await readOne('one', { kind: 'file', path: 'data.json' });
    expect(dataset?.table?.rows).toEqual([['north', 10]]);

    subject.datasets.push({ key: '../elsewhere.json' });
    const escaped = await readOne('one', { kind: 'file', path: '../elsewhere.json' });
    expect(escaped?.error).toBe(`"../elsewhere.json" is outside the visualization's own workspace`);
  });

  it('re-draws every chart on the dataset it re-read', async () => {
    const subject = record({ datasets: [{ key: 'source', table: TABLE }] });
    const made = drawn(subject, { kind: 'source' }, [], { kind: 'bar', x: 'region', y: 'revenue', title: 'T' }, 'c1', 0);
    if ('error' in made) throw new Error(made.error);
    subject.charts = [made.chart];
    const { readOne } = harness(subject, async () => ({ text: 'region,revenue\nnorth,10\n' }));

    await readOne('one', { kind: 'source' });

    expect(subject.charts[0]?.table.rows).toHaveLength(1);
  });

  it('keeps the table a chart had, and records the reason, when a re-read breaks it', async () => {
    const subject = record({ datasets: [{ key: 'source', table: TABLE }] });
    const made = drawn(subject, { kind: 'source' }, [], { kind: 'bar', x: 'region', y: 'revenue', title: 'T' }, 'c1', 0);
    if ('error' in made) throw new Error(made.error);
    subject.charts = [made.chart];
    const { readOne, commits } = harness(subject, async () => ({ text: 'town,cost\nnorth,10\n' }));

    await readOne('one', { kind: 'source' });

    expect(subject.charts[0]?.table.rows).toHaveLength(2);
    expect(commits[0]?.error).toBe('no column named "region"');
  });

  it('does nothing for a record the index does not hold, or a dataset it has', async () => {
    const subject = record();
    const { readOne } = harness(subject, async () => ({ text: 'region,revenue\nnorth,10\n' }));

    expect(await readOne('missing', { kind: 'source' })).toBeUndefined();
    expect(await readOne('one', { kind: 'file', path: 'nope.json' })).toBeUndefined();
  });
});

describe('the index it reads through', () => {
  it('refuses to apply a read to a record deleted while it was in flight', async () => {
    const subject = record();
    const gate = Promise.withResolvers<void>();
    const { readOne, index } = harness(subject, async () => {
      await gate.promise;
      return { text: 'region,revenue\nnorth,10\n' };
    });

    const pending = readOne('one', { kind: 'source' });
    index.markDeleted('one');
    gate.resolve();

    expect(await pending).toBeUndefined();
    expect(subject.datasets[0]?.table).toBeUndefined();
  });
});
