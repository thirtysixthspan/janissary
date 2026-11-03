import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { composeConnectionsTopicData } from './connections-topic-rows.js';

function fixture() {
  const tabs: Tab[] = [
    { label: 'first', title: 'First tab', dotColor: '', number: 1, log: [], runtime: { busy: false, context: [], queue: [], lastActivity: 100 } },
    { label: 'second', dotColor: '', number: 2, log: [], runtime: { busy: false, context: [], queue: [], lastActivity: 300 } },
    { label: 'idle', dotColor: '', number: 3, log: [], runtime: { busy: false, context: [], queue: [] } },
  ];
  tabs[0]!.runtime!.acpRecordId = 'core-record';
  const recordRows = [
    { id: 'core-record', kind: 'acp', title: 'ACP: current', model: 'model-a', ownerLabel: 'first', ownerName: 'First tab', startedAt: 1, updatedAt: 400, status: 'Running' },
    { id: 'agent-record', kind: 'agent', title: 'Agent: task', model: 'model-b', ownerLabel: 'closed-owner', ownerName: 'Captured name', runId: 'run-1', startedAt: 2, updatedAt: 200, status: 'Completed' },
  ];
  const managers = {
    tab: {
      tabs, byLabel: vi.fn((label: string) => tabs.find((tab) => tab.label === label)),
      shorten: vi.fn((value: string) => value), cwdOf: vi.fn(() => '/repo'),
    },
    shell: { has: vi.fn(() => false) },
    acp: { label: vi.fn((label: string) => label === 'first' ? 'same-session-name' : null) },
    monitor: { connectionsFor: vi.fn((label: string) => label === 'first' ? [{ text: 'monitor session', kind: 'acp', acpRef: { scope: 'monitor', name: 'monitor-1' } }] : []) },
    editorAcp: { connectionsFor: vi.fn((label: string) => label === 'second' ? [{ text: 'persona session', kind: 'acp', acpRef: { scope: 'editor', label: 'second', persona: 'reviewer' } }] : []) },
    browser: { info: vi.fn(() => null) },
    pty: { terminalsFor: vi.fn((label: string) => label === 'first' ? ['term-a'] : []) },
    database: {
      listOpen: vi.fn(() => ['shared-db', 'orphan-db']),
      openDbs: vi.fn((label: string) => ['first', 'second'].includes(label) ? ['shared-db'] : []),
    },
    acpRecords: {
      rows: vi.fn(() => recordRows),
      window: vi.fn((id: string, count: number) => ({ id, count, blocks: [], totalBlocks: 24, offset: 24 - count, hasOlder: count < 24 })),
    },
  } as unknown as Managers;
  return { managers, recordRows, tabs };
}

describe('connections topic rows', () => {
  it('composes live and durable rows once with truthful activity, ordering, and focus ownership', () => {
    const { managers } = fixture();
    const data = composeConnectionsTopicData(managers, new Map());

    expect(data.rows.map((row) => [row.type, row.id, row.orderingTimestamp])).toEqual([
      ['record', 'core-record', 400],
      ['live', 'shared-db', 300],
      ['record', 'agent-record', 200],
      ['live', 'monitor-1', 100],
      ['live', 'term-a', 100],
      ['live', 'reviewer', 300],
      ['live', 'orphan-db', 0],
    ].toSorted((left, right) => Number(right[2]) - Number(left[2])
      || String(left[0]).localeCompare(String(right[0])) || String(left[1]).localeCompare(String(right[1]))));

    const core = data.rows.find((row) => row.type === 'record' && row.id === 'core-record');
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'acp' && row.ownerLabel === 'first'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'monitor-1' })]));
    expect(core).toMatchObject({ ownerName: 'First tab', orderingTimestamp: 400 });
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'sqlite')).toEqual([
      expect.objectContaining({ id: 'shared-db', ownerLabel: 'first', focusTarget: 'first', orderingTimestamp: 300 }),
      expect.objectContaining({ id: 'orphan-db', ownerLabel: '', ownerName: 'Global', orderingTimestamp: 0 }),
    ]);
    expect(data.rows.find((row) => row.type === 'record' && row.id === 'agent-record'))
      .toMatchObject({ ownerName: 'Captured name', orderingTimestamp: 200 });
    expect(data.rows.filter((row) => row.type === 'live' && row.id === 'same-session-name')).toHaveLength(0);
    expect(managers.database.listOpen).toHaveBeenCalledTimes(4);
  });

  it('uses exact activity timestamps and orders ties by kind then id', () => {
    const { managers, tabs } = fixture();
    tabs[0]!.runtime!.lastActivity = 1000;
    tabs[1]!.runtime!.lastActivity = 1000;
    const result = composeConnectionsTopicData(managers, new Map()).rows;
    expect(result.filter((row) => row.orderingTimestamp === 1000).map((row) => `${row.kind}:${row.id}`))
      .toEqual(['acp:monitor-1', 'acp:reviewer', 'sqlite:shared-db', 'terminal:term-a']);
  });

  it('projects windows only for requested ids and prunes absent requests', () => {
    const { managers } = fixture();
    const requested = new Map([['core-record', 20], ['deleted-record', 40]]);
    const data = composeConnectionsTopicData(managers, requested);
    expect(requested.has('deleted-record')).toBe(false);
    expect(data.rows.find((row) => row.type === 'record' && row.id === 'core-record'))
      .toMatchObject({ window: { id: 'core-record', count: 20 } });
    expect(data.rows.find((row) => row.type === 'record' && row.id === 'agent-record')).not.toHaveProperty('window');
    expect(managers.acpRecords.window).toHaveBeenCalledWith('core-record', 20);
  });
});
