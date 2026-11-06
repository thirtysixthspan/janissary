import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atomicWriteFile } from '../atomic-write.js';
import { messageBus, type Subscription } from '../bus.js';
import { AcpSessionRecords } from './manager.js';
import { ACP_RECORD_RETENTION_MS } from './model.js';
import { AcpRecordStore } from './store.js';
import type { AcpRecord, AcpRecordSource } from './types.js';

const core: AcpRecordSource = { kind: 'acp', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Original Bob' };
const agent: AcpRecordSource = { ...core, kind: 'agent', runId: 'run-1', taskPath: '/tasks/task.md' };
let projectDir: string;
let now: number;
let changes: ReturnType<typeof vi.fn>;
let subscriptions: Subscription[];
const create = (options: ConstructorParameters<typeof AcpSessionRecords>[0] = {}) =>
  new AcpSessionRecords({ projectDir, now: () => now, ...options });
const file = (id: string) => path.join(projectDir, '.janissary', 'connections', `${id}.json`);
const read = (id: string) => new AcpRecordStore({ projectDir }).read(id)!;
const seed = (source: AcpRecordSource = core, extra: Partial<AcpRecord> = {}): AcpRecord => {
  const record: AcpRecord = {
    schemaVersion: 1, id: randomUUID(), source, title: 'Saved', startedAt: 1, updatedAt: 2, blocks: [], ...extra,
  };
  new AcpRecordStore({ projectDir }).write(record);
  return record;
};
beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'acp-record-manager-'));
  now = 100;
  changes = vi.fn();
  subscriptions = [messageBus.on('connections', 'changed', changes)];
});
afterEach(() => {
  for (const subscription of subscriptions) subscription.unsubscribe();
  vi.restoreAllMocks();
  rmSync(projectDir, { recursive: true, force: true });
});

describe('AcpSessionRecords transitions', () => {
  it('mints independent UUIDs across lifetimes, copies provenance, and immediately persists headers', () => {
    const records = create();
    const source = { ...agent };
    const id = records.begin(source);
    expect(id).toMatch(/^[\da-f-]{36}$/u);
    expect(id).not.toBe(source.runId);
    expect(read(id)).toMatchObject({ schemaVersion: 1, id, source, blocks: [], title: 'Agent: task.md' });
    source.ownerName = 'New Bob';
    expect(records.rows()[0].ownerName).toBe('Original Bob');
    const next = create();
    const nextId = next.begin(core);
    expect(nextId).not.toBe(id);
    expect(next.rows().find((row) => row.id === id)?.ownerName).toBe('Original Bob');
    expect(next.rows().find((row) => row.id === nextId)?.status).toBe('Idle');
  });

  it('projects role tags on core record rows while keeping legacy rows untagged', () => {
    const records = create();
    const tellId = records.begin({ ...core, role: 'tell' });
    const legacyId = records.begin(core);

    expect(records.rows().find((row) => row.id === tellId)).toHaveProperty('role', 'tell');
    expect(records.window(tellId)).toMatchObject({ role: 'tell', source: { role: 'tell' } });
    expect(records.rows().find((row) => row.id === legacyId)).not.toHaveProperty('role');
    expect(records.window(legacyId)?.source).not.toHaveProperty('role');
  });

  it.each([null, [], {}, { ...core, model: '' }, { ...core, ownerLabel: ' ' }, { ...core, ownerName: '' },
    { ...core, role: 'reader' }, { ...agent, runId: '' }, { ...agent, taskPath: '' }, { ...core, kind: 'unknown' }])('rejects invalid source %j without side effects', (source) => {
    const records = create();
    expect(() => records.begin(source as AcpRecordSource)).toThrow('Invalid ACP record source.');
    expect(records.rows()).toEqual([]);
    expect(existsSync(path.dirname(file(randomUUID())))).toBe(false);
    expect(changes).not.toHaveBeenCalled();
  });

  it('persists only at boundaries and fixes the first title while preserving original text and folds', () => {
    const write = vi.fn(atomicWriteFile);
    const records = create({ store: new AcpRecordStore({ projectDir, write }) });
    const id = records.begin(core);
    expect(write).toHaveBeenCalledTimes(1);
    const prompt = '  first line\r\nsecond line';
    now = 101;
    expect(records.prompt(id, prompt)).toBe(true);
    expect(records.rows()[0]).toMatchObject({ title: 'ACP: first line', status: 'Running' });
    expect(read(id)).toMatchObject({ title: 'ACP: first line', updatedAt: 101, blocks: [] });
    now = 102;
    expect(records.activity(id, 'message', 'hello')).toBe(true);
    now = 103;
    records.activity(id, 'message', ' ');
    records.activity(id, 'message', 'world');
    records.activity(id, 'thought', 'thinking');
    expect(write).toHaveBeenCalledTimes(2);
    expect(records.answer(id, '')).toBe(true);
    expect(write).toHaveBeenCalledTimes(3);
    expect(records.rows()[0].status).toBe('Idle');
    expect(read(id).blocks[0]).toEqual({
      prompt, startedAt: 101, endedAt: 103, answer: '', entries: [
        { kind: 'message', text: 'hello world', timestamp: 102 },
        { kind: 'thought', text: 'thinking', timestamp: 103 },
      ],
    });
    records.prompt(id, 'do not rename');
    records.activity(id, 'message', 'partial');
    expect(read(id).blocks).toHaveLength(1);
    records.close(id, 'Closed');
    expect(read(id).blocks).toHaveLength(2);
    expect(read(id).blocks[1]).not.toHaveProperty('answer');
    expect(read(id).title).toBe('ACP: first line');
    expect(changes).toHaveBeenCalledTimes(10);
  });

  it('keeps an empty first-line title and keeps agents Running after settlement', () => {
    const records = create();
    const id = records.begin(core);
    records.prompt(id, '\nrest');
    records.answer(id, 'answer');
    records.prompt(id, 'later');
    expect(records.rows()[0].title).toBe('ACP');
    const agentId = records.begin(agent);
    records.prompt(agentId, 'task');
    records.answer(agentId, 'done');
    expect(records.window(agentId)?.status).toBe('Running');
    expect(records.close(agentId, 'Completed')).toBe(true);
    expect(records.window(agentId)?.status).toBe('Completed');
  });

  it.each(['Closed', 'Completed', 'Failed', 'Terminated'] as const)('accepts agent outcome %s without replacing its first closure', (outcome) => {
    const records = create();
    const id = records.begin(agent);
    records.prompt(id, 'running');
    records.activity(id, 'thought', 'partial');
    now = 200;
    expect(records.close(id, outcome)).toBe(true);
    now = 300;
    expect(records.close(id, 'Closed')).toBe(false);
    expect(read(id)).toMatchObject({ outcome, endedAt: 200, updatedAt: 200,
      blocks: [{ prompt: 'running', entries: [{ kind: 'thought', text: 'partial' }] }] });
    expect(records.window(id)?.status).toBe(outcome);
    expect(changes).toHaveBeenCalledTimes(4);
  });

  it('refuses every inapplicable transition and publishes only accepted changes', () => {
    const records = create();
    for (const id of ['../escape', '', randomUUID()]) {
      expect(records.prompt(id, 'prompt')).toBe(false);
      expect(records.activity(id, 'message', 'text')).toBe(false);
      expect(records.answer(id, '')).toBe(false);
      expect(records.close(id, 'Closed')).toBe(false);
      expect(records.delete(id)).toBe(false);
      expect(records.window(id)).toBeUndefined();
    }
    expect(changes).not.toHaveBeenCalled();
    const id = records.begin(core);
    expect(records.prompt(id, ' \n ')).toBe(false);
    expect(records.answer(id, 'early')).toBe(false);
    expect(records.activity(id, 'message', 'early')).toBe(false);
    expect(records.delete(id)).toBe(false);
    expect(records.close(id, 'Completed')).toBe(false);
    expect(records.close(id, 'invalid' as never)).toBe(false);
    expect(records.prompt(id, 'prompt')).toBe(true);
    expect(records.prompt(id, 'overlap')).toBe(false);
    expect(records.activity(id, 'unknown' as never, 'chunk')).toBe(false);
    expect(records.activity(id, 'message', '')).toBe(false);
    expect(records.answer(id, '')).toBe(true);
    expect(records.answer(id, 'duplicate')).toBe(false);
    expect(records.activity(id, 'message', 'late')).toBe(false);
    expect(records.close(id, 'Closed')).toBe(true);
    expect(records.close(id, 'Closed')).toBe(false);
    expect(records.prompt(id, 'closed')).toBe(false);
    expect(records.activity(id, 'message', 'closed')).toBe(false);
    expect(records.answer(id, 'closed')).toBe(false);
    expect(changes).toHaveBeenCalledTimes(4);
    expect(records.delete(id)).toBe(true);
    expect(records.delete(id)).toBe(false);
    expect(changes).toHaveBeenCalledTimes(5);
    expect(existsSync(file(id))).toBe(false);
  });

  it('clamps backwards clocks and retains the first close time', () => {
    const records = create();
    const id = records.begin(core);
    now = 90;
    records.prompt(id, 'prompt');
    now = 80;
    records.activity(id, 'message', 'text');
    records.answer(id, 'answer');
    records.close(id, 'Closed');
    now = 200;
    records.close(id, 'Closed');
    expect(read(id)).toMatchObject({ startedAt: 100, updatedAt: 100, endedAt: 100,
      blocks: [{ startedAt: 100, endedAt: 100, entries: [{ timestamp: 100 }] }] });
  });

  it('keeps window reads detached, stateless, and silent including invalid-count reads', () => {
    const records = create();
    const id = records.begin(core);
    for (let index = 0; index < 41; index += 1) {
      records.prompt(id, `prompt ${index}`);
      records.activity(id, 'message', 'text');
      records.answer(id, 'answer');
    }
    const before = changes.mock.calls.length;
    const view = records.window(id, 40)!;
    expect(view.offset).toBe(1);
    view.source.ownerName = 'edited';
    view.blocks[0].entries[0].text = 'edited';
    expect(records.window(id)?.offset).toBe(21);
    expect(records.window(id, 41)?.blocks[1].entries[0].text).toBe('text');
    const rows = records.rows();
    rows[0].ownerName = 'edited';
    expect(records.rows()[0].ownerName).toBe('Original Bob');
    expect(() => records.window('unknown', 0)).toThrow('Invalid ACP record window count.');
    expect(changes).toHaveBeenCalledTimes(before);
  });
});

describe('startup and retention', () => {
  it('recovers crash-left headers and completed history without the in-flight block or resurrection', () => {
    const first = create();
    const coreId = first.begin(core);
    const agentId = first.begin(agent);
    first.prompt(coreId, 'saved');
    first.activity(coreId, 'message', 'reply');
    first.answer(coreId, 'answer');
    first.prompt(coreId, 'lost');
    first.activity(coreId, 'thought', 'lost');
    first.prompt(agentId, 'lost agent');
    changes.mockClear();
    now = 200;
    const next = create();
    expect(next.window(coreId)).toMatchObject({ status: 'Closed', startedAt: 100, endedAt: 200, updatedAt: 200, totalBlocks: 1 });
    expect(next.window(coreId)?.blocks[0].answer).toBe('answer');
    expect(next.window(agentId)).toMatchObject({ status: 'Terminated', totalBlocks: 0 });
    expect(read(coreId).outcome).toBe('Closed');
    expect(read(agentId).outcome).toBe('Terminated');
    expect(changes).toHaveBeenCalledTimes(2);
    now = 300;
    expect(create().window(coreId)?.endedAt).toBe(200);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('captures startup once and clamps recovery against future updated times', () => {
    const value = seed(core, { updatedAt: 300 });
    const clock = vi.fn(() => 200);
    const records = create({ now: clock });
    expect(clock).toHaveBeenCalledTimes(1);
    expect(records.window(value.id)).toMatchObject({ startedAt: 1, updatedAt: 300, endedAt: 300 });
  });

  it.each(['Closed', 'Completed', 'Failed', 'Terminated'] as const)('prunes %s strictly beyond 30 days by closure, not start time', (outcome) => {
    now = ACP_RECORD_RETENTION_MS + 1000;
    const source = outcome === 'Closed' ? core : agent;
    const expired = seed(source, { outcome, endedAt: 999, updatedAt: 999 });
    const exact = seed(source, { outcome, endedAt: 1000, updatedAt: 1000 });
    const below = seed(source, { outcome, endedAt: 1001, updatedAt: 1001 });
    const recent = seed(source, { outcome, endedAt: now, updatedAt: now });
    const future = seed(source, { outcome, endedAt: now + 1, updatedAt: now + 1 });
    const records = create();
    expect(new Set(records.rows().map((row) => row.id))).toEqual(new Set([exact.id, below.id, recent.id, future.id]));
    expect(existsSync(file(expired.id))).toBe(false);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('isolates failed recovery and pruning, retaining rows for retry and malformed files on disk', () => {
    now = ACP_RECORD_RETENTION_MS + 100;
    const brokenRecovery = seed();
    const recovered = seed(agent);
    const brokenPrune = seed(core, { outcome: 'Closed', endedAt: 2 });
    const pruned = seed(core, { outcome: 'Closed', endedAt: 2 });
    const malformed = randomUUID();
    writeFileSync(file(malformed), 'null');
    const report = vi.fn();
    const records = create({ reportStorageError: report, store: new AcpRecordStore({
      projectDir,
      write: (target, text) => {
        if (target === file(brokenRecovery.id)) throw new Error('write denied');
        atomicWriteFile(target, text);
      },
      remove: (target) => {
        if (target === file(brokenPrune.id)) throw new Error('delete denied');
        rmSync(target);
      },
    }) });
    expect(records.window(brokenRecovery.id)?.status).toBe('Closed');
    expect(read(brokenRecovery.id).outcome).toBeUndefined();
    expect(read(recovered.id).outcome).toBe('Terminated');
    expect(records.window(brokenPrune.id)).toBeDefined();
    expect(records.window(pruned.id)).toBeUndefined();
    expect(records.window(malformed)).toBeUndefined();
    expect(existsSync(file(malformed))).toBe(true);
    expect(report).toHaveBeenCalledTimes(3);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('reports a root scan error once and exposes empty history even if reporting throws', () => {
    mkdirSync(path.dirname(path.dirname(file('unused'))), { recursive: true });
    writeFileSync(path.dirname(file('unused')), 'not a directory');
    const report = vi.fn(() => { throw new Error('reporter'); });
    expect(create({ reportStorageError: report }).rows()).toEqual([]);
    expect(report).toHaveBeenCalledExactlyOnceWith('scan', expect.stringMatching(/^scan failed:/u));
    expect(changes).not.toHaveBeenCalled();
  });
});

describe('failure handling and disposal', () => {
  it('retains failed answers, retries at the next boundary, and isolates throwing reporters', () => {
    let failing = false;
    const write = vi.fn((target: string, content: string | Uint8Array) => {
      if (failing) throw new Error('disk full.\nsecond line');
      atomicWriteFile(target, content);
    });
    const report = vi.fn(() => { throw new Error('reporter'); });
    const records = create({ reportStorageError: report, store: new AcpRecordStore({ projectDir, write }) });
    const id = records.begin(core);
    records.prompt(id, 'prompt');
    failing = true;
    expect(records.answer(id, 'valuable answer')).toBe(true);
    expect(records.window(id)?.blocks[0].answer).toBe('valuable answer');
    expect(read(id).blocks).toEqual([]);
    expect(report).toHaveBeenCalledExactlyOnceWith(id, 'write failed: disk full');
    failing = false;
    records.prompt(id, 'next');
    expect(read(id).blocks[0].answer).toBe('valuable answer');
    expect(read(id).blocks).toHaveLength(1);
    records.close(id, 'Closed');
    expect(read(id).blocks).toHaveLength(2);
    expect(changes).toHaveBeenCalledTimes(5);
  });

  it('retains failed deletes without events and removes an absent file after every save failed', () => {
    let denyDelete = true;
    const records = create({ reportStorageError: vi.fn(), store: new AcpRecordStore({
      projectDir,
      write: () => { throw new Error('disk full'); },
      remove: (target) => {
        if (denyDelete) throw new Error('denied');
        rmSync(target, { force: true });
      },
    }) });
    const id = records.begin(core);
    records.close(id, 'Closed');
    expect(records.delete(id)).toBe(false);
    expect(records.window(id)?.status).toBe('Closed');
    expect(changes).toHaveBeenCalledTimes(2);
    denyDelete = false;
    expect(records.delete(id)).toBe(true);
    expect(records.rows()).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('cannot be interrupted by a throwing typed bus subscriber', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    subscriptions.push(messageBus.on('connections', 'changed', () => { throw new Error('subscriber'); }));
    const records = create();
    const id = records.begin(core);
    records.close(id, 'Closed');
    expect(read(id).outcome).toBe('Closed');
    expect(changes).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(1);
  });

  it('formats default storage warnings as one stderr line', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const records = create({ store: new AcpRecordStore({ projectDir, write: () => { throw new Error('full.\nstack'); } }) });
    const id = records.begin(core);
    expect(stderr).toHaveBeenCalledExactlyOnceWith(`warning: ACP record "${id}" write failed: full\n`);
  });

  it('retries a failed empty header on disposal without losing the record', () => {
    let failing = true;
    const records = create({ reportStorageError: vi.fn(), store: new AcpRecordStore({ projectDir,
      write: (target, content) => {
        if (failing) throw new Error('full');
        atomicWriteFile(target, content);
      },
    }) });
    const id = records.begin(core);
    expect(existsSync(file(id))).toBe(false);
    expect(records.window(id)).toMatchObject({ title: 'ACP', status: 'Idle', totalBlocks: 0 });
    failing = false;
    records.dispose();
    expect(read(id)).toMatchObject({ outcome: 'Closed', blocks: [] });
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('attempts every save, retries dirty terminal records silently, and closes fallback agents as Closed', () => {
    const failed = new Set<string>();
    const write = vi.fn((target: string, content: string | Uint8Array) => {
      if (failed.has(target)) throw new Error('full');
      atomicWriteFile(target, content);
    });
    const records = create({ reportStorageError: vi.fn(), store: new AcpRecordStore({ projectDir, write }) });
    const terminal = records.begin(agent);
    failed.add(file(terminal));
    records.close(terminal, 'Completed');
    const openCore = records.begin(core);
    const openAgent = records.begin(agent);
    records.prompt(openAgent, 'partial prompt');
    records.activity(openAgent, 'message', 'partial output');
    failed.delete(file(terminal));
    failed.add(file(openCore));
    const before = changes.mock.calls.length;
    const writes = write.mock.calls.length;
    records.dispose();
    expect(write).toHaveBeenCalledTimes(writes + 3);
    expect(changes).toHaveBeenCalledTimes(before + 2);
    expect(read(terminal).outcome).toBe('Completed');
    expect(records.window(openCore)?.status).toBe('Closed');
    expect(read(openAgent)).toMatchObject({ outcome: 'Closed', blocks: [{ prompt: 'partial prompt', entries: [{ text: 'partial output' }] }] });
    records.dispose();
    expect(write).toHaveBeenCalledTimes(writes + 3);
    expect(changes).toHaveBeenCalledTimes(before + 2);
    expect(() => records.begin(core)).toThrow('ACP session records are disposed.');
    expect(records.prompt(openCore, 'no')).toBe(false);
    expect(records.activity(openCore, 'message', 'no')).toBe(false);
    expect(records.answer(openCore, 'no')).toBe(false);
    expect(records.close(openCore, 'Closed')).toBe(false);
    expect(records.delete(terminal)).toBe(false);
    expect(records.rows()).toHaveLength(3);
  });

  it('emits nothing for empty or clean-terminal disposal', () => {
    const empty = create();
    empty.dispose();
    empty.dispose();
    expect(changes).not.toHaveBeenCalled();
    const records = create();
    const id = records.begin(core);
    records.close(id, 'Closed');
    changes.mockClear();
    records.dispose();
    expect(changes).not.toHaveBeenCalled();
    expect(readFileSync(file(id), 'utf8')).toContain('Closed');
  });
});
