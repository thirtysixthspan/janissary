import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpRecord } from '../acp-records/types.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { ACP_RECORD_WINDOW_SIZE, recordWindow } from '../acp-records/model.js';
import { messageBus } from '../bus.js';
import { readConnectionsTopic, runConnectionsTopicAction, subscribeConnectionsTopic } from './connections-topic.js';

function fixture() {
  const tabs: Tab[] = [
    { label: 'owner', title: 'Owner', dotColor: '', number: 1, log: [], runtime: { busy: false, context: [], queue: [], acpRecordId: 'core-id' } },
    { label: 'second', dotColor: '', number: 2, log: [], runtime: { busy: false, context: [], queue: [] } },
    {
      label: 'core-tab', title: 'Core record', dotColor: '', number: 3, log: [], view: 'plugin',
      plugin: { id: 'connections', instanceKey: 'core-id', schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'owner' },
      runtime: { busy: false, context: [], queue: [] },
    },
  ];
  const recordRows = [
    { id: 'core-id', kind: 'acp', title: 'ACP', model: 'm', ownerLabel: 'owner', ownerName: 'Owner', startedAt: 1, updatedAt: 2, status: 'Running' },
    { id: 'agent-id', kind: 'agent', title: 'Agent', model: 'm', ownerLabel: 'gone', ownerName: 'Captured', runId: 'run-id', startedAt: 1, updatedAt: 1, status: 'Running' },
    { id: 'done-id', kind: 'acp', title: 'Done', model: 'm', ownerLabel: 'gone', ownerName: 'Captured', startedAt: 1, updatedAt: 1, endedAt: 2, status: 'Completed' },
  ];
  const totalBlocks = ACP_RECORD_WINDOW_SIZE * 2 + 5;
  const windows = vi.fn((id: string, count = ACP_RECORD_WINDOW_SIZE) => ({
    id, count, blocks: Array.from({ length: Math.min(count, totalBlocks) }, (_, index) => index),
    totalBlocks, offset: Math.max(0, totalBlocks - count), hasOlder: count < totalBlocks,
  }));
  const cancel = vi.fn(() => Promise.resolve(true));
  const close = vi.fn(() => true);
  const finish = vi.fn(() => Promise.resolve());
  const setActiveTab = vi.fn();
  const closeTarget = vi.fn(() => Promise.resolve());
  const managers = {
    tab: {
      tabs, findIndex: vi.fn((label: string) => tabs.findIndex((tab) => tab.label === label)),
      setActiveTab, byLabel: vi.fn((label: string) => tabs.find((tab) => tab.label === label)),
      shorten: vi.fn((value: string) => value), cwdOf: vi.fn(() => '/repo'),
    },
    shell: { has: vi.fn(() => true) },
    acp: { label: vi.fn(() => null), cancel, close },
    monitor: { connectionsFor: vi.fn(() => []) },
    editorAcp: { connectionsFor: vi.fn(() => []) },
    browser: { info: vi.fn(() => null) },
    pty: { terminalsFor: vi.fn(() => []) },
    database: { listOpen: vi.fn(() => []), openDbs: vi.fn(() => []) },
    acpRecords: {
      rows: vi.fn(() => recordRows), window: windows,
      delete: vi.fn((id: string) => id === 'done-id'),
    },
    connection: { closeTarget },
    agent: { isLive: vi.fn(() => true), isAgentRun: vi.fn(() => true), finish },
  } as unknown as Managers;
  return { managers, tabs, recordRows, windows, cancel, close, finish, setActiveTab, closeTarget, totalBlocks };
}

afterEach(() => {
  vi.useRealTimers();
  messageBus.clear();
});

describe('connections topic delivery', () => {
  it('coalesces both signals and reads current rows at fire time, then releases pending timers', () => {
    vi.useFakeTimers();
    const { managers, tabs } = fixture();
    const deliveries: number[] = [];
    const subscription = subscribeConnectionsTopic(() => {
      deliveries.push(readConnectionsTopic(managers).rows.find((row) => row.type === 'live')?.orderingTimestamp ?? -1);
    });

    messageBus.emit('connections', { type: 'changed' });
    messageBus.emit('connections', { type: 'changed' });
    messageBus.emit('state', { type: 'dirty' });
    tabs[0]!.runtime!.lastActivity = 77;
    vi.advanceTimersByTime(100);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toBe(77);

    messageBus.emit('connections', { type: 'changed' });
    vi.advanceTimersByTime(100);
    expect(deliveries).toHaveLength(2);
    messageBus.emit('state', { type: 'dirty' });
    vi.advanceTimersByTime(100);
    expect(deliveries).toHaveLength(3);
    messageBus.emit('state', { type: 'dirty' });
    vi.advanceTimersByTime(50);
    messageBus.emit('connections', { type: 'changed' });
    vi.advanceTimersByTime(50);
    expect(deliveries).toHaveLength(4);

    messageBus.emit('state', { type: 'dirty' });
    subscription.unsubscribe();
    vi.advanceTimersByTime(100);
    expect(deliveries).toHaveLength(4);
  });
});

describe('connections topic actions', () => {
  it('loads and pages requested windows, resets on load, and isolates manager state', () => {
    const { managers, windows, totalBlocks } = fixture();
    const row = () => {
      const found = readConnectionsTopic(managers).rows
        .find((candidate) => candidate.type === 'record' && candidate.id === 'core-id');
      if (found?.type !== 'record') throw new Error('missing core record row');
      return found;
    };
    expect(row()).not.toHaveProperty('window');
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'core-id' });
    expect(windows).not.toHaveBeenCalled();
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'missing' });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    const loadedCount = row().window?.count;
    expect(loadedCount).toBe(ACP_RECORD_WINDOW_SIZE);
    expect(row()).toMatchObject({
      window: {
        count: ACP_RECORD_WINDOW_SIZE,
        offset: totalBlocks - ACP_RECORD_WINDOW_SIZE,
        hasOlder: true,
      },
    });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'core-id' });
    expect(row().window?.count).toBe((loadedCount ?? 0) + ACP_RECORD_WINDOW_SIZE);
    expect(row()).toMatchObject({
      window: {
        count: ACP_RECORD_WINDOW_SIZE * 2,
        offset: totalBlocks - ACP_RECORD_WINDOW_SIZE * 2,
        hasOlder: true,
      },
    });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    expect(row()).toMatchObject({
      window: {
        count: ACP_RECORD_WINDOW_SIZE,
        offset: totalBlocks - ACP_RECORD_WINDOW_SIZE,
      },
    });
    const another = fixture().managers;
    expect(readConnectionsTopic(another).rows.find((candidate) => candidate.type === 'record' && candidate.id === 'core-id'))
      .not.toHaveProperty('window');
  });

  it('refuses loadOlder for a record with no blocks and keeps its empty window', () => {
    const { managers, tabs, recordRows, windows } = fixture();
    const empty: AcpRecord = {
      schemaVersion: 1, id: 'empty-id',
      source: { kind: 'acp', model: 'm', ownerLabel: 'owner', ownerName: 'Owner' },
      title: 'Empty', startedAt: 1, updatedAt: 3, blocks: [],
    };
    recordRows.push({
      id: 'empty-id', kind: 'acp', title: 'Empty', model: 'm', ownerLabel: 'owner', ownerName: 'Owner',
      startedAt: 1, updatedAt: 3, status: 'Idle',
    });
    tabs.push({
      label: 'empty-tab', title: 'Empty record', dotColor: '', number: 4, log: [], view: 'plugin',
      plugin: { id: 'connections', instanceKey: 'empty-id', schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'owner' },
      runtime: { busy: false, context: [], queue: [] },
    });
    const original = windows.getMockImplementation()!;
    windows.mockImplementation((id: string, count = ACP_RECORD_WINDOW_SIZE) => id === 'empty-id'
      ? recordWindow(empty, count)
      : original(id, count));
    const row = () => readConnectionsTopic(managers).rows
      .find((candidate) => candidate.type === 'record' && candidate.id === 'empty-id');

    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'empty-id' });
    expect(row()).toMatchObject({ window: { blocks: [], totalBlocks: 0, offset: 0, hasOlder: false } });

    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'empty-id' });
    expect(() => row()).not.toThrow();
    expect(row()).toMatchObject({ window: { blocks: [], totalBlocks: 0, offset: 0, hasOlder: false } });

    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'empty-id' });
    expect(row()).toMatchObject({ window: { blocks: [], totalBlocks: 0, offset: 0, hasOlder: false } });
    expect(windows.mock.calls.filter(([id]) => id === 'empty-id').every(([, count]) => count === ACP_RECORD_WINDOW_SIZE)).toBe(true);
  });

  it('releases a loaded window when its record tab closes and reloads the newest window on reopen', () => {
    const { managers, tabs, totalBlocks } = fixture();
    const recordTab = tabs.find((tab) => tab.plugin?.instanceKey === 'core-id')!;
    const row = (id: string) => readConnectionsTopic(managers).rows
      .find((candidate) => candidate.type === 'record' && candidate.id === id);

    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    expect(row('core-id')).toMatchObject({
      window: {
        count: ACP_RECORD_WINDOW_SIZE,
        offset: totalBlocks - ACP_RECORD_WINDOW_SIZE,
        hasOlder: true,
      },
    });
    expect(row('agent-id')).not.toHaveProperty('window');

    tabs.splice(tabs.indexOf(recordTab), 1);
    expect(row('core-id')).not.toHaveProperty('window');

    tabs.push(recordTab);
    expect(row('core-id')).not.toHaveProperty('window');
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    expect(row('core-id')).toMatchObject({
      window: { count: ACP_RECORD_WINDOW_SIZE, offset: totalBlocks - ACP_RECORD_WINDOW_SIZE },
    });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'core-id' });
    expect(row('core-id')).toMatchObject({
      window: {
        count: ACP_RECORD_WINDOW_SIZE * 2,
        offset: totalBlocks - ACP_RECORD_WINDOW_SIZE * 2,
        hasOlder: true,
      },
    });

    tabs.splice(tabs.indexOf(recordTab), 1);
    expect(row('core-id')).not.toHaveProperty('window');
    expect(row('agent-id')).not.toHaveProperty('window');
  });

  it('lists legacy text and validates live open and close actions against the current owner', () => {
    const { managers, setActiveTab, closeTarget } = fixture();
    expect(runConnectionsTopicAction(managers, { topic: 'connections', action: 'list', label: 'owner' }))
      .toBe('shell:zsh');
    managers.shell.has = vi.fn(() => false);
    expect(runConnectionsTopicAction(managers, { topic: 'connections', action: 'list', label: 'owner' }))
      .toBe('No open connections.');
    managers.shell.has = vi.fn(() => true);
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'owner',
    });
    expect(setActiveTab).toHaveBeenCalledWith(0);
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });
    expect(setActiveTab).toHaveBeenLastCalledWith(1);
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'stale',
    });
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'shell', id: 'zsh', ownerLabel: 'owner',
    });
    expect(closeTarget).toHaveBeenCalledWith('shell', 'zsh', 'owner');
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });
    expect(closeTarget).toHaveBeenLastCalledWith('shell', 'zsh', 'second');
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'shell', id: 'missing', ownerLabel: 'owner',
    });
    expect(closeTarget).toHaveBeenCalledTimes(2);
    expect(setActiveTab).toHaveBeenCalledTimes(2);
  });

  it('shows SQLite rows as global and validates their open and close against the current owner', () => {
    const { managers, setActiveTab, closeTarget, windows } = fixture();
    managers.database.listOpen = vi.fn(() => ['shared-db', 'orphan-db']);
    managers.database.openDbs = vi.fn((label: string) => (label === 'owner' ? ['shared-db'] : []));

    const sqlite = readConnectionsTopic(managers).rows.filter((row) => row.type === 'live' && row.kind === 'sqlite');
    expect(sqlite).toEqual([
      expect.objectContaining({
        id: 'orphan-db', display: 'sqlite:orphan-db', ownerName: 'global', ownerLabel: '',
      }),
      expect.objectContaining({
        id: 'shared-db', display: 'sqlite:shared-db', ownerName: 'global', ownerLabel: 'owner', focusTarget: 'owner',
      }),
    ]);
    expect(sqlite.find((row) => row.id === 'orphan-db')).not.toHaveProperty('focusTarget');

    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared-db', ownerLabel: 'owner',
    });
    expect(setActiveTab).toHaveBeenLastCalledWith(0);
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared-db', ownerLabel: 'global',
    });
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'orphan-db', ownerLabel: '',
    });
    expect(setActiveTab).toHaveBeenCalledTimes(1);
    expect(closeTarget).not.toHaveBeenCalled();

    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'sqlite', id: 'shared-db', ownerLabel: 'global',
    });
    expect(closeTarget).not.toHaveBeenCalled();
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'sqlite', id: 'shared-db', ownerLabel: 'owner',
    });
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'sqlite', id: 'orphan-db', ownerLabel: '',
    });
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'closeCommand', kind: 'sqlite', id: 'orphan-db', label: 'invoking-tab',
    });
    expect(closeTarget).toHaveBeenNthCalledWith(1, 'sqlite', 'shared-db', 'owner');
    expect(closeTarget).toHaveBeenNthCalledWith(2, 'sqlite', 'orphan-db', '');
    expect(closeTarget).toHaveBeenNthCalledWith(3, 'sqlite', 'orphan-db', 'invoking-tab');
    expect(windows).not.toHaveBeenCalled();
  });

  it('runs command close without live-row validation for every connection kind', () => {
    const { managers, closeTarget } = fixture();
    for (const kind of ['sqlite', 'shell', 'acp', 'browser', 'ssh', 'terminal'] as const) {
      runConnectionsTopicAction(managers, {
        topic: 'connections', action: 'closeCommand', kind, id: 'target', label: 'invoking-tab',
      });
    }
    expect(closeTarget).toHaveBeenCalledTimes(6);
    expect(closeTarget).toHaveBeenNthCalledWith(1, 'sqlite', 'target', 'invoking-tab');
    expect(closeTarget).toHaveBeenNthCalledWith(4, 'browser', 'target', 'invoking-tab');
  });

  it('starts browser command close without awaiting its notification', async () => {
    const { managers, closeTarget } = fixture();
    const pending = Promise.withResolvers<void>();
    closeTarget.mockReturnValue(pending.promise as never);
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'closeCommand', kind: 'browser', id: 'missing', label: 'owner',
    });
    expect(closeTarget).toHaveBeenCalledWith('browser', 'missing', 'owner');
    pending.resolve();
    await pending.promise;
  });

  it('validates core ACP and agent run ownership and deletes only terminal records', async () => {
    const { managers, recordRows, cancel, close, finish } = fixture();
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'cancel', id: 'core-id' });
    expect(cancel).toHaveBeenCalledWith('owner');
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'closeSession', id: 'core-id' });
    expect(close).toHaveBeenCalledWith('owner');

    recordRows[0]!.status = 'Idle';
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'cancel', id: 'core-id' });
    expect(cancel).toHaveBeenCalledTimes(1);
    recordRows[0]!.status = 'Running';
    managers.tab.byLabel = vi.fn(() => ({ label: 'owner', runtime: { acpRecordId: 'different-id' } })) as never;
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'cancel', id: 'core-id' });
    expect(cancel).toHaveBeenCalledTimes(1);

    runConnectionsTopicAction(managers, { topic: 'connections', action: 'terminate', id: 'agent-id' });
    expect(finish).toHaveBeenCalledWith('run-id', 'terminated');
    await Promise.resolve();
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'delete', id: 'core-id' });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'delete', id: 'done-id' });
    expect(managers.acpRecords.delete).toHaveBeenCalledTimes(1);
    expect(managers.acpRecords.delete).toHaveBeenCalledWith('done-id');
  });
});
