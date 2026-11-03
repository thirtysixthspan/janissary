import { describe, expect, it } from 'vitest';
import { appendActivity, ACP_RECORD_RETENTION_MS, durableRecord, isExpired, recordRows, recordStatus, recordTitle, recordWindow } from './model.js';
import type { AcpRecord, AcpRecordBlock, AcpRecordSource } from './types.js';

const core: AcpRecordSource = { kind: 'acp', model: 'provider/model', ownerLabel: 'bob', ownerName: 'Bob' };
const agent: AcpRecordSource = { ...core, kind: 'agent', runId: 'run', taskPath: '/tasks/execute.md' };
const block = (index = 0): AcpRecordBlock => ({
  prompt: `prompt ${index}`, startedAt: index, answer: '', endedAt: index,
  entries: [{ kind: 'message', text: 'reply', timestamp: index }],
});
const record = (count = 0): AcpRecord => ({
  schemaVersion: 1, id: 'a', source: { ...core }, title: 'ACP', startedAt: 0, updatedAt: 100,
  blocks: Array.from({ length: count }, (_, index) => block(index)),
});

describe('record model', () => {
  it('derives core and agent status with terminal precedence', () => {
    const value = record();
    expect(recordStatus(value)).toBe('Idle');
    value.blocks.push({ prompt: 'run', startedAt: 1, entries: [] });
    expect(recordStatus(value)).toBe('Running');
    value.blocks[0].answer = '';
    expect(recordStatus(value)).toBe('Idle');
    value.source = agent;
    expect(recordStatus(value)).toBe('Running');
    value.blocks = [];
    expect(recordStatus(value)).toBe('Running');
    for (const outcome of ['Closed', 'Completed', 'Failed', 'Terminated'] as const) {
      value.outcome = outcome;
      expect(recordStatus(value)).toBe(outcome);
    }
  });

  it('formats first-line titles with CRLF, empty first lines, and the full cap', () => {
    expect(recordTitle(core)).toBe('ACP');
    expect(recordTitle(core, '  first line \r\nsecond')).toBe('ACP: first line');
    expect(recordTitle(core, '\r\nsecond')).toBe('ACP');
    expect(recordTitle(core, 'x'.repeat(100))).toBe(`ACP: ${'x'.repeat(55)}`);
    expect(recordTitle(agent)).toBe('Agent: execute.md');
    expect(recordTitle({ ...agent, taskPath: `${'x'.repeat(100)}.md` })).toHaveLength(110);
  });

  it('folds only adjacent messages and thoughts, preserving text and first timestamps', () => {
    const value: AcpRecordBlock = { prompt: 'run', startedAt: 0, entries: [] };
    appendActivity(value, { kind: 'message', text: 'hello', timestamp: 1 });
    appendActivity(value, { kind: 'message', text: ' ', timestamp: 2 });
    appendActivity(value, { kind: 'message', text: 'world', timestamp: 3 });
    appendActivity(value, { kind: 'thought', text: 'think', timestamp: 4 });
    appendActivity(value, { kind: 'thought', text: '\nmore', timestamp: 5 });
    appendActivity(value, { kind: 'message', text: 'new', timestamp: 6 });
    for (const kind of ['tool', 'plan', 'permission'] as const) {
      appendActivity(value, { kind, text: 'one', timestamp: 7 });
      appendActivity(value, { kind, text: 'two', timestamp: 8 });
    }
    expect(value.entries).toHaveLength(9);
    expect(value.entries.slice(0, 3)).toEqual([
      { kind: 'message', text: 'hello world', timestamp: 1 },
      { kind: 'thought', text: 'think\nmore', timestamp: 4 },
      { kind: 'message', text: 'new', timestamp: 6 },
    ]);
    const next = block();
    appendActivity(next, { kind: 'message', text: 'next', timestamp: 9 });
    expect(value.entries[0].text).toBe('hello world');
  });

  it('sorts detached metadata rows by recency and id without exposing history', () => {
    const a = { ...record(1), id: 'a', source: agent };
    const b = { ...record(), id: 'b' };
    const c = { ...record(), id: 'c', updatedAt: 101 };
    const rows = recordRows([b, c, a]);
    expect(rows.map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(rows[1]).toMatchObject({ kind: 'agent', runId: 'run', ownerName: 'Bob' });
    expect(rows[1]).not.toHaveProperty('blocks');
    rows[1].ownerName = 'changed';
    expect(a.source.ownerName).toBe('Bob');
  });

  it.each([0, 20, 21, 41])('projects the newest default suffix of %s blocks', (count) => {
    const value = record(count);
    const view = recordWindow(value);
    expect(view.blocks).toEqual(value.blocks.slice(-20));
    expect(view.totalBlocks).toBe(count);
    expect(view.offset).toBe(Math.max(0, count - 20));
    expect(view.hasOlder).toBe(count > 20);
    expect(recordWindow(value, 100).blocks).toHaveLength(count);
  });

  it('includes running blocks, expands to 40, and detaches every nested projection', () => {
    const value = record(41);
    delete value.blocks[40].answer;
    delete value.blocks[40].endedAt;
    const view = recordWindow(value, 40);
    expect(view.offset).toBe(1);
    expect(view.blocks.at(-1)?.answer).toBeUndefined();
    view.source.ownerName = 'edited';
    view.blocks[0].prompt = 'edited';
    view.blocks[0].entries[0].text = 'edited';
    view.blocks.push(block());
    expect(value.source.ownerName).toBe('Bob');
    expect(value.blocks[1]).toEqual(block(1));
    expect(value.blocks).toHaveLength(41);
    expect(durableRecord(value).blocks).toHaveLength(40);
    value.outcome = 'Closed';
    expect(durableRecord(value).blocks).toHaveLength(41);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects window count %s', (count) => {
    expect(() => recordWindow(record(), count)).toThrow('Invalid ACP record window count.');
  });

  it('expires strictly by closure time, retaining exact boundaries and future closures', () => {
    const value = record();
    expect(isExpired(value, Infinity)).toBe(false);
    value.endedAt = 100;
    expect(isExpired(value, 100 + ACP_RECORD_RETENTION_MS)).toBe(false);
    expect(isExpired(value, 101 + ACP_RECORD_RETENTION_MS)).toBe(true);
    expect(isExpired(value, 99)).toBe(false);
  });
});
