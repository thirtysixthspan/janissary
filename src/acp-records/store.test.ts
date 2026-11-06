import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcpRecordStore } from './store.js';
import type { AcpRecord } from './types.js';
import type { AcpRole } from '../acp/role.js';

let projectDir: string;
let root: string;
const fixture = (): AcpRecord => ({
  schemaVersion: 1, id: randomUUID(), title: 'Agent: task.md',
  source: { kind: 'agent', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Bob', runId: 'run-1', taskPath: '/tasks/task.md' },
  startedAt: 1, updatedAt: 10, endedAt: 10, outcome: 'Terminated',
  blocks: [
    { prompt: 'first\nline', startedAt: 2, entries: [{ kind: 'thought', text: 'think', timestamp: 3 }], answer: '', endedAt: 4 },
    { prompt: 'second', startedAt: 5, entries: [{ kind: 'message', text: 'partial', timestamp: 6 }] },
  ],
});
const coreFixture = (role?: AcpRole): AcpRecord => ({
  ...fixture(),
  title: 'ACP: task',
  outcome: 'Closed',
  source: {
    kind: 'acp', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Bob',
    ...(role !== undefined && { role }),
  },
});
beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'acp-record-store-'));
  root = path.join(projectDir, '.janissary', 'connections');
});
afterEach(() => { rmSync(projectDir, { recursive: true, force: true }); });

describe('AcpRecordStore', () => {
  it('treats a missing root as empty without creating it', () => {
    const store = new AcpRecordStore({ projectDir });
    expect(store.scan(vi.fn())).toEqual([]);
    expect(store.read(randomUUID())).toBeUndefined();
    expect(existsSync(root)).toBe(false);
  });

  it('round-trips versioned metadata and settled and terminal-unanswered history in flat UUID files', () => {
    const store = new AcpRecordStore({ projectDir });
    const value = fixture();
    store.write(value);
    expect(readdirSync(root)).toEqual([`${value.id}.json`]);
    expect(readFileSync(path.join(root, `${value.id}.json`), 'utf8')).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(store.read(value.id)).toEqual(value);
    expect(store.scan(vi.fn())).toEqual([value]);
    const other = new AcpRecordStore({ projectDir: path.join(projectDir, 'other') });
    expect(other.scan(vi.fn())).toEqual([]);
    other.write({ ...value, title: 'Other' });
    expect(store.read(value.id)?.title).toBe(value.title);
  });

  it.each(['ask', 'tell'] as const)('round-trips a core record tagged with the %s role', (role) => {
    const store = new AcpRecordStore({ projectDir });
    const value = coreFixture(role);

    store.write(value);

    expect(store.read(value.id)).toEqual(value);
  });

  it('accepts a legacy core record without role metadata and preserves its name', () => {
    const store = new AcpRecordStore({ projectDir });
    const value = coreFixture();
    value.title = 'Existing ACP name';

    store.write(value);

    const stored = store.read(value.id);
    expect(stored).toEqual(value);
    expect(stored?.source).not.toHaveProperty('role');
    expect(stored?.title).toBe('Existing ACP name');
  });

  it('omits the running block until a close but retains its header and completed history', () => {
    const store = new AcpRecordStore({ projectDir });
    const value = fixture();
    delete value.endedAt;
    delete value.outcome;
    store.write(value);
    expect(store.read(value.id)?.blocks).toEqual(value.blocks.slice(0, 1));
    expect(store.read(value.id)?.updatedAt).toBe(10);
  });

  it.each(['../outside', '', 'not-a-uuid', '/absolute', `${randomUUID()}/../escape`])('refuses unsafe id %s before I/O', (id) => {
    const write = vi.fn();
    const remove = vi.fn();
    const store = new AcpRecordStore({ projectDir, write, remove });
    expect(() => store.read(id)).toThrow('Invalid ACP record id.');
    expect(() => store.delete(id)).toThrow('Invalid ACP record id.');
    expect(() => store.write({ ...fixture(), id })).toThrow('Invalid ACP record id.');
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);
  });

  it.each([
    ['null', () => null],
    ['array', () => []],
    ['version', (v: AcpRecord) => ({ ...v, schemaVersion: 2 })],
    ['identity', (v: AcpRecord) => ({ ...v, id: randomUUID() })],
    ['source', (v: AcpRecord) => ({ ...v, source: { ...v.source, kind: 'other' } })],
    ['model', (v: AcpRecord) => ({ ...v, source: { ...v.source, model: ' ' } })],
    ['ACP role', (v: AcpRecord) => ({
      ...v,
      source: { kind: 'acp', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Bob', role: 'reader' },
    })],
    ['run linkage', (v: AcpRecord) => ({ ...v, source: { ...v.source, runId: '' } })],
    ['core outcome', (v: AcpRecord) => ({ ...v, source: { ...v.source, kind: 'acp' } })],
    ['outcome', (v: AcpRecord) => ({ ...v, outcome: 'Idle' })],
    ['missing end', (v: AcpRecord) => ({ ...v, endedAt: undefined })],
    ['missing outcome', (v: AcpRecord) => ({ ...v, outcome: undefined })],
    ['negative time', (v: AcpRecord) => ({ ...v, startedAt: -1 })],
    ['nonfinite time', (v: AcpRecord) => ({ ...v, updatedAt: Infinity })],
    ['reversed time', (v: AcpRecord) => ({ ...v, updatedAt: 0 })],
    ['end after update', (v: AcpRecord) => ({ ...v, endedAt: 11 })],
    ['activity kind', (v: AcpRecord) => { v.blocks[0].entries[0].kind = 'bad' as never; return v; }],
    ['entry order', (v: AcpRecord) => { v.blocks[0].entries.push({ kind: 'tool', text: 'bad', timestamp: 2 }); return v; }],
    ['entry after end', (v: AcpRecord) => { v.blocks[0].entries[0].timestamp = 5; return v; }],
    ['block order', (v: AcpRecord) => { v.blocks[1].startedAt = 3; return v; }],
    ['answer pair', (v: AcpRecord) => { delete v.blocks[0].endedAt; return v; }],
    ['end pair', (v: AcpRecord) => { delete v.blocks[0].answer; return v; }],
    ['unanswered before newest', (v: AcpRecord) => { delete v.blocks[0].answer; delete v.blocks[0].endedAt; return v; }],
  ] as const)('rejects invalid %s without modifying the document and warns once', (_name, corrupt) => {
    const store = new AcpRecordStore({ projectDir });
    const value = fixture();
    store.write(value);
    const file = path.join(root, `${value.id}.json`);
    const content = JSON.stringify(corrupt(value));
    writeFileSync(file, content);
    const report = vi.fn();
    expect(store.scan(report)).toEqual([]);
    expect(store.scan(report)).toEqual([]);
    expect(report).toHaveBeenCalledExactlyOnceWith(value.id, expect.objectContaining({ message: 'Invalid or unsupported record' }));
    expect(readFileSync(file, 'utf8')).toBe(content);
  });

  it('skips stray, temporary, directory, and symlink entries while retaining malformed JSON', () => {
    const store = new AcpRecordStore({ projectDir });
    const value = fixture();
    store.write(value);
    const badId = randomUUID();
    writeFileSync(path.join(root, `${badId}.json`), '{broken');
    writeFileSync(path.join(root, 'stray.json'), 'null');
    writeFileSync(path.join(root, `${randomUUID()}.json.tmp`), 'null');
    mkdirSync(path.join(root, `${randomUUID()}.json`));
    const linkId = randomUUID();
    symlinkSync(path.join(root, `${value.id}.json`), path.join(root, `${linkId}.json`));
    const report = vi.fn();
    expect(store.scan(report)).toEqual([value]);
    expect(store.read(linkId)).toBeUndefined();
    expect(report).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(root, `${badId}.json`))).toBe(true);
  });

  it('propagates failed writes and removals, preserving the previous document', () => {
    const value = fixture();
    new AcpRecordStore({ projectDir }).write(value);
    const original = readFileSync(path.join(root, `${value.id}.json`), 'utf8');
    const store = new AcpRecordStore({
      projectDir,
      write: () => { throw new Error('disk full'); },
      remove: () => { throw new Error('denied'); },
    });
    expect(() => store.write({ ...value, title: 'Replacement' })).toThrow('disk full');
    expect(() => store.delete(value.id)).toThrow('denied');
    expect(readFileSync(path.join(root, `${value.id}.json`), 'utf8')).toBe(original);
    new AcpRecordStore({ projectDir }).delete(value.id);
    expect(() => new AcpRecordStore({ projectDir }).delete(value.id)).not.toThrow();
  });
});
