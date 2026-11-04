import { describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import { connectionsManifest } from './manifest.js';
import { activate } from './activate.js';

function fixture(rows: unknown[] = []) {
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn();
  const closeOwnTab = vi.fn();
  const dockTab = vi.fn();
  const topicAction = vi.fn(() => 'connections output');
  const topicData = vi.fn(() => ({ rows }));
  const rejectRequest = vi.fn((message: string): never => { throw new Error(message); });
  const reportFailure = vi.fn((message: string): never => { throw new Error(message); });
  const capabilities = {
    openOrFocusTab, updateTab, closeOwnTab, dockTab, topicAction, topicData, rejectRequest, reportFailure,
    originTab: vi.fn(() => ({ label: 'owner', cwd: '/repo', root: '/repo' })),
    note: vi.fn(),
  } as unknown as TabPluginServerCapabilities;
  return { activation: activate(), capabilities, openOrFocusTab, updateTab, closeOwnTab, dockTab, topicAction, topicData, rejectRequest, reportFailure };
}

const liveRow = {
  type: 'live', id: 'db', kind: 'sqlite', display: 'sqlite:db', ownerLabel: 'owner', ownerName: 'Owner',
  status: 'Open', orderingTimestamp: 1,
};
const recordRow = {
  type: 'record', id: 'uuid', kind: 'acp', title: 'ACP title', model: 'model', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 2, status: 'Running', orderingTimestamp: 2,
};
const agentRow = {
  type: 'record', id: 'agent-run', kind: 'agent', title: 'Agent task', model: 'model', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 2, status: 'Completed', orderingTimestamp: 2,
};

describe('connections plugin activation', () => {
  it('declares the command aliases and only the capabilities this slice uses', () => {
    expect(connectionsManifest).toMatchObject({
      id: 'connections', tabLabelPrefix: 'connections', command: 'connections', commandAliases: ['connection'],
      notifications: ['connections'],
    });
    expect(connectionsManifest.capabilities).toEqual([
      'openOrFocusTab', 'updateTab', 'closeOwnTab', 'dockTab', 'topicData', 'topicAction', 'originTab', 'note',
      'rejectRequest', 'reportFailure',
    ]);
  });

  it('opens the singleton list, docks only plural commands, and returns plural bare invocation to centre', () => {
    const f = fixture([liveRow]);
    f.activation.command?.('', f.capabilities, 'connections');
    expect(f.openOrFocusTab).toHaveBeenCalledWith('connections', expect.any(Function));
    expect(f.dockTab).toHaveBeenLastCalledWith('connections', null);
    f.activation.command?.('left', f.capabilities, 'connections');
    expect(f.dockTab).toHaveBeenLastCalledWith('connections', 'left');
    f.activation.command?.('', f.capabilities, 'connections');
    expect(f.dockTab).toHaveBeenLastCalledWith('connections', null);
    f.activation.command?.('sqlite:db', f.capabilities, 'connection');
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'open', kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
  });

  it('updates list and record tabs and closes a record tab when its row disappears', () => {
    const f = fixture([recordRow]);
    const event = { topic: 'connections', data: { rows: [recordRow] }, tabs: ['connections', 'uuid'] } as const;
    f.activation.notify?.(event, f.capabilities);
    expect(f.updateTab).toHaveBeenCalledWith('connections', expect.any(Function));
    expect(f.updateTab).toHaveBeenCalledWith('uuid', expect.any(Function));
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid' });

    f.activation.notify?.({ ...event, data: { rows: [] } }, f.capabilities);
    expect(f.closeOwnTab).toHaveBeenCalledWith('uuid');
  });

  it('opens a durable record after requesting its newest window', () => {
    const f = fixture([recordRow]);
    f.activation.command?.('uuid', f.capabilities, 'connection');
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid' });
    expect(f.openOrFocusTab).toHaveBeenCalledWith('uuid', expect.any(Function));
  });

  it('rejects malformed intents without failing the plugin and disposes cleanly', () => {
    const f = fixture([liveRow]);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open', payload: { id: 'db' }, tabPayload: { kind: 'list', rows: [liveRow] },
    }, f.capabilities)).toThrow('invalid open payload');
    expect(f.reportFailure).not.toHaveBeenCalled();
    expect(f.activation.intent({
      tab: 'connections', intent: 'open', payload: { kind: 'sqlite', id: 'db' }, tabPayload: { kind: 'list', rows: [liveRow] },
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'open', kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
    f.activation.dispose?.();
  });

  it('opens a current agent record by id without trusting client row data', () => {
    const f = fixture([agentRow]);
    expect(f.activation.intent({
      tab: 'connections', intent: 'open-record', payload: { id: 'agent-run' },
      tabPayload: { kind: 'list', rows: [agentRow] },
    }, f.capabilities)).toBeNull();
    expect(f.topicData).toHaveBeenCalledWith('connections');
    expect(f.openOrFocusTab).toHaveBeenCalledWith('agent-run', expect.any(Function));
  });

  it.each([
    ['missing', 'missing', []],
    ['live', 'db', [liveRow]],
  ])('rejects a %s row for open-record', (_case, id, rows) => {
    const f = fixture(rows);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open-record', payload: { id },
      tabPayload: { kind: 'list', rows },
    }, f.capabilities)).toThrow('invalid open-record payload');
    expect(f.openOrFocusTab).not.toHaveBeenCalled();
    expect(f.reportFailure).not.toHaveBeenCalled();
  });

  it('rejects a stale agent id using current topic data', () => {
    const f = fixture([]);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open-record', payload: { id: 'agent-run' },
      tabPayload: { kind: 'list', rows: [agentRow] },
    }, f.capabilities)).toThrow('invalid open-record payload');
    expect(f.openOrFocusTab).not.toHaveBeenCalled();
  });

  it.each([
    ['attributed', 'first', 'first'],
    ['unattributed', '', undefined],
  ] as const)('forwards the current %s SQLite owner from a global row intent', (_case, ownerLabel, focusTarget) => {
    const current = {
      type: 'live', id: 'shared', kind: 'sqlite', display: 'sqlite:shared', ownerLabel, ownerName: 'global',
      status: 'Open', orderingTimestamp: 1, ...(focusTarget && { focusTarget }),
    } as const;
    const stale = { ...current, ownerLabel: 'stale' };
    const f = fixture([current]);
    const tabPayload = { kind: 'list', rows: [stale] };

    expect(f.activation.intent({
      tab: 'connections', intent: 'open', payload: { kind: 'sqlite', id: 'shared' }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared', ownerLabel,
    });
    expect(f.activation.intent({
      tab: 'connections', intent: 'close', payload: { kind: 'sqlite', id: 'shared' }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'close', kind: 'sqlite', id: 'shared', ownerLabel,
    });
  });
});
