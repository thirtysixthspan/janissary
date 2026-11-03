import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { messageBus } from '../bus.js';
import { readConnectionsTopic, runConnectionsTopicAction, subscribeConnectionsTopic } from './connections-topic.js';

function fixture() {
  const tabs: Tab[] = [
    { label: 'owner', title: 'Owner', dotColor: '', number: 1, log: [], runtime: { busy: false, context: [], queue: [], acpRecordId: 'core-id' } },
    { label: 'second', dotColor: '', number: 2, log: [], runtime: { busy: false, context: [], queue: [] } },
  ];
  const recordRows = [
    { id: 'core-id', kind: 'acp', title: 'ACP', model: 'm', ownerLabel: 'owner', ownerName: 'Owner', startedAt: 1, updatedAt: 2, status: 'Running' },
    { id: 'agent-id', kind: 'agent', title: 'Agent', model: 'm', ownerLabel: 'gone', ownerName: 'Captured', runId: 'run-id', startedAt: 1, updatedAt: 1, status: 'Running' },
    { id: 'done-id', kind: 'acp', title: 'Done', model: 'm', ownerLabel: 'gone', ownerName: 'Captured', startedAt: 1, updatedAt: 1, endedAt: 2, status: 'Completed' },
  ];
  const windows = vi.fn((id: string, count = 20) => ({
    id, count, blocks: Array.from({ length: Math.min(count, 45) }, (_, index) => index),
    totalBlocks: 45, offset: Math.max(0, 45 - count), hasOlder: count < 45,
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
  return { managers, tabs, recordRows, windows, cancel, close, finish, setActiveTab, closeTarget };
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
    const { managers, windows } = fixture();
    expect(readConnectionsTopic(managers).rows.find((row) => row.type === 'record' && row.id === 'core-id'))
      .not.toHaveProperty('window');
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'core-id' });
    expect(windows).not.toHaveBeenCalled();
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'missing' });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    expect(readConnectionsTopic(managers).rows.find((row) => row.type === 'record' && row.id === 'core-id'))
      .toMatchObject({ window: { count: 20, offset: 25, hasOlder: true } });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'loadOlder', id: 'core-id' });
    expect(readConnectionsTopic(managers).rows.find((row) => row.type === 'record' && row.id === 'core-id'))
      .toMatchObject({ window: { count: 40, offset: 5, hasOlder: true } });
    runConnectionsTopicAction(managers, { topic: 'connections', action: 'load', id: 'core-id' });
    expect(readConnectionsTopic(managers).rows.find((row) => row.type === 'record' && row.id === 'core-id'))
      .toMatchObject({ window: { count: 20, offset: 25 } });
    const another = fixture().managers;
    expect(readConnectionsTopic(another).rows.find((row) => row.type === 'record' && row.id === 'core-id'))
      .not.toHaveProperty('window');
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
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'stale',
    });
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'shell', id: 'zsh', ownerLabel: 'owner',
    });
    expect(closeTarget).toHaveBeenCalledWith('shell', 'zsh', 'owner');
    runConnectionsTopicAction(managers, {
      topic: 'connections', action: 'close', kind: 'shell', id: 'missing', ownerLabel: 'owner',
    });
    expect(closeTarget).toHaveBeenCalledTimes(1);
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
