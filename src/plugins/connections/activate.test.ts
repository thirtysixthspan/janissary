import { describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import { connectionsManifest } from './manifest.js';
import { activate } from './activate.js';

function fixture(rows: unknown[] = []) {
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn((_key: string, _factory: () => unknown) => {});
  const closeOwnTab = vi.fn();
  const dockTab = vi.fn();
  const topicAction = vi.fn((_action: { action?: string }) => undefined as string | undefined);
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
  type: 'live', id: 'db', kind: 'sqlite', display: 'sqlite:db', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  status: 'Open', orderingTimestamp: 1,
};
const recordRow = {
  type: 'record', id: 'uuid', kind: 'acp', title: 'ACP title', model: 'model', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 2, status: 'Running', orderingTimestamp: 2,
};
const agentRow = {
  type: 'record', id: 'agent-run', kind: 'agent', title: 'Agent task', model: 'model', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
  startedAt: 1, updatedAt: 2, status: 'Completed', orderingTimestamp: 2,
};

function loadedWindow() {
  return {
    id: 'uuid',
    source: { kind: 'acp' as const, model: 'model', ownerLabel: 'owner', ownerName: 'Owner' },
    blocks: Array.from({ length: 20 }, (_, index) => ({ prompt: `prompt ${index}`, startedAt: index, entries: [] })),
    totalBlocks: 25,
    offset: 5,
    hasOlder: true,
  };
}

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

  it('keeps a loaded record window on the record tab and out of the list payload', () => {
    const window = loadedWindow();
    const loaded = { ...recordRow, window };
    const f = fixture([loaded]);

    f.activation.command?.('', f.capabilities, 'connections');
    const [, openList] = f.openOrFocusTab.mock.calls[0];
    const opened = openList();
    expect(opened).toStrictEqual({ title: 'connections', payload: { kind: 'list', rows: [recordRow] } });
    expect(opened.payload.rows[0]).not.toHaveProperty('window');

    const event = { topic: 'connections', data: { rows: [loaded] }, tabs: ['connections', 'uuid'] } as const;
    f.activation.notify?.(event, f.capabilities);

    const [, refreshList] = f.updateTab.mock.calls.find(([key]) => key === 'connections')!;
    const listed = refreshList();
    expect(listed).toStrictEqual({ payload: { kind: 'list', rows: [recordRow] } });
    expect(listed.payload.rows[0]).not.toHaveProperty('window');

    const [, refreshRecord] = f.updateTab.mock.calls.find(([key]) => key === 'uuid')!;
    expect(refreshRecord()).toMatchObject({ payload: { kind: 'connection', record: { id: 'uuid', window } } });
    expect(loaded).toHaveProperty('window');
  });

  it('opens the record tab before requesting its window and refreshes it with the loaded record', () => {
    const window = loadedWindow();
    const f = fixture([recordRow]);
    let loaded = false;
    f.topicAction.mockImplementation((action) => {
      if (action.action === 'load') loaded = true;
      return 'connections output';
    });
    f.topicData.mockImplementation(() => ({ rows: [{ ...recordRow, ...(loaded && { window }) }] }));

    f.activation.command?.('uuid', f.capabilities, 'connection');

    expect(f.openOrFocusTab).toHaveBeenCalledWith('uuid', expect.any(Function));
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid' });
    expect(f.openOrFocusTab.mock.invocationCallOrder[0]).toBeLessThan(f.topicAction.mock.invocationCallOrder[0]);
    expect(f.updateTab).toHaveBeenCalledWith('uuid', expect.any(Function));
    const [, open] = f.openOrFocusTab.mock.calls[0];
    expect(open()).toMatchObject({ title: 'acp:Owner', payload: { kind: 'connection', record: { id: 'uuid' } } });
    const [key, refresh] = f.updateTab.mock.calls[0];
    expect(key).toBe('uuid');
    expect(refresh()).toMatchObject({ title: 'acp:Owner', payload: { kind: 'connection', record: { id: 'uuid', window } } });
  });

  it.each([
    ['ACP session', recordRow, 'uuid', 'acp:Owner'],
    ['agent run', agentRow, 'agent-run', 'agent:Owner'],
  ] as const)('titles a refreshed %s connection tab by its kind and owning tab', (_case, row, key, title) => {
    const f = fixture([row]);
    f.activation.notify?.({ topic: 'connections', data: { rows: [row] }, tabs: [key] }, f.capabilities);
    const [, refresh] = f.updateTab.mock.calls.find(([updated]) => updated === key)!;
    expect(refresh()).toMatchObject({ title, payload: { kind: 'connection', record: { id: key, title: row.title } } });
  });

  it('rejects malformed intents without failing the plugin and disposes cleanly', () => {
    const f = fixture([liveRow]);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open', payload: { id: 'db' }, tabPayload: { kind: 'list', rows: [liveRow] },
    }, f.capabilities)).toThrow('invalid open payload');
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open', payload: { kind: 'sqlite', id: 'db' }, tabPayload: { kind: 'list', rows: [liveRow] },
    }, f.capabilities)).toThrow('invalid open payload');
    expect(f.reportFailure).not.toHaveBeenCalled();
    expect(f.activation.intent({
      tab: 'connections', intent: 'open',
      payload: { kind: 'sqlite', id: 'db', ownerLabel: 'owner' },
      tabPayload: { kind: 'list', rows: [liveRow] },
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'open', kind: 'sqlite', id: 'db', ownerLabel: 'owner' });
    f.activation.dispose?.();
  });

  it('refreshes the list from the current topic rows, keeping record windows out of it', () => {
    const loaded = { ...recordRow, window: loadedWindow() };
    const f = fixture([liveRow, loaded]);
    expect(f.activation.intent({
      tab: 'connections', intent: 'refresh', payload: {}, tabPayload: { kind: 'list', rows: [] },
    }, f.capabilities)).toBeNull();
    expect(f.topicData).toHaveBeenCalledWith('connections');
    expect(f.updateTab).toHaveBeenCalledExactlyOnceWith('connections', expect.any(Function));
    const [, refresh] = f.updateTab.mock.calls[0];
    const result = refresh() as { title?: string; payload: { kind: string; rows: Record<string, unknown>[] } };
    expect(result.title).toBeUndefined();
    expect(result.payload).toEqual({ kind: 'list', rows: [liveRow, recordRow] });
    expect(result.payload.rows[1]).not.toHaveProperty('window');
  });

  it.each([
    ['a non-empty payload', { extra: true }, { kind: 'list', rows: [liveRow] }, 'invalid refresh payload'],
    ['a record tab', {}, { kind: 'connection', record: recordRow }, 'refresh applies only to the connections list'],
  ])('rejects refresh with %s without failing the plugin', (_case, payload, tabPayload, message) => {
    const f = fixture([liveRow]);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'refresh', payload, tabPayload,
    }, f.capabilities)).toThrow(message);
    expect(f.updateTab).not.toHaveBeenCalled();
    expect(f.reportFailure).not.toHaveBeenCalled();
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

  it('refuses a close intent for a record that has since closed without deleting it', () => {
    const closed = { ...recordRow, status: 'Closed' } as const;
    const f = fixture([closed]);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'close',
      payload: { kind: 'acp', id: 'uuid', ownerLabel: 'owner' },
      tabPayload: { kind: 'list', rows: [recordRow] },
    }, f.capabilities)).toThrow('invalid close payload');
    expect(f.rejectRequest).toHaveBeenCalledWith('invalid close payload');
    expect(f.topicAction).not.toHaveBeenCalled();
  });

  it('refuses an open ACP record close with the topic message', () => {
    const message = 'The owning tab no longer holds this record.';
    const f = fixture([recordRow]);
    f.topicAction.mockReturnValue(message);
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'close',
      payload: { kind: 'acp', id: 'uuid', ownerLabel: 'owner' },
      tabPayload: { kind: 'list', rows: [recordRow] },
    }, f.capabilities)).toThrow(message);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'closeSession', id: 'uuid' });
    expect(f.rejectRequest).toHaveBeenCalledWith(message);
    expect(f.closeOwnTab).not.toHaveBeenCalled();
  });

  it('passes a terminal record delete intent through to the delete topic action', () => {
    const closed = { ...recordRow, status: 'Closed' } as const;
    const f = fixture([closed]);
    expect(f.activation.intent({
      tab: 'connections', intent: 'delete', payload: { id: 'uuid' },
      tabPayload: { kind: 'list', rows: [closed] },
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'delete', id: 'uuid' });
  });

  it.each([
    ['cancel', 'cancel', 'Only a running record can be cancelled.'],
    ['close-session', 'closeSession', 'Only an open record can be closed.'],
    ['terminate', 'terminate', 'The run is no longer live.'],
    ['delete', 'delete', 'An open record cannot be deleted.'],
  ] as const)('rejects a refused %s intent with the topic message', (intent, action, message) => {
    const f = fixture([recordRow]);
    f.topicAction.mockReturnValue(message);
    expect(() => f.activation.intent({
      tab: 'connections', intent, payload: { id: 'uuid' },
      tabPayload: { kind: 'connection', record: recordRow },
    }, f.capabilities)).toThrow(message);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action, id: 'uuid' });
    expect(f.rejectRequest).toHaveBeenCalledWith(message);
  });

  it('leaves load-older without a refusal even when the topic answers', () => {
    const f = fixture([recordRow]);
    f.topicAction.mockReturnValue('ignored');
    expect(f.activation.intent({
      tab: 'connections', intent: 'load-older', payload: { id: 'uuid' },
      tabPayload: { kind: 'connection', record: recordRow },
    }, f.capabilities)).toBeNull();
    expect(f.rejectRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['attributed', 'first', 'first'],
    ['unattributed', '', undefined],
  ] as const)('forwards the current %s SQLite owner from the intent owner', (_case, ownerLabel, focusTarget) => {
    const current = {
      type: 'live', id: 'shared', kind: 'sqlite', display: 'sqlite:shared', host: 'Local', ownerLabel, ownerName: 'global',
      status: 'Open', orderingTimestamp: 1, ...(focusTarget && { focusTarget }),
    } as const;
    const stale = { ...current, ownerLabel: 'stale' };
    const f = fixture([current]);
    const tabPayload = { kind: 'list', rows: [stale] };

    expect(f.activation.intent({
      tab: 'connections', intent: 'open',
      payload: { kind: 'sqlite', id: 'shared', ownerLabel }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared', ownerLabel,
    });
    expect(f.activation.intent({
      tab: 'connections', intent: 'close',
      payload: { kind: 'sqlite', id: 'shared', ownerLabel }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'close', kind: 'sqlite', id: 'shared', ownerLabel,
    });
    expect(() => f.activation.intent({
      tab: 'connections', intent: 'close',
      payload: { kind: 'sqlite', id: 'shared', ownerLabel: 'stale' }, tabPayload,
    }, f.capabilities)).toThrow('invalid close payload');
    expect(f.topicAction).toHaveBeenCalledTimes(2);
  });

  it('acts on the second tab when two tabs expose the same shell id', () => {
    const first = {
      type: 'live', id: 'zsh', kind: 'shell', display: 'shell:~/first', host: 'Local', ownerLabel: 'first', ownerName: 'First',
      status: 'Open', orderingTimestamp: 2, focusTarget: 'first',
    } as const;
    const second = {
      ...first, display: 'shell:~/second', ownerLabel: 'second', ownerName: 'Second', focusTarget: 'second',
    } as const;
    const f = fixture([first, second]);
    const tabPayload = { kind: 'list', rows: [first, second] };

    expect(f.activation.intent({
      tab: 'connections', intent: 'open',
      payload: { kind: 'shell', id: 'zsh', ownerLabel: 'second' }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });
    expect(f.activation.intent({
      tab: 'connections', intent: 'close',
      payload: { kind: 'shell', id: 'zsh', ownerLabel: 'second' }, tabPayload,
    }, f.capabilities)).toBeNull();
    expect(f.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'close', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });
    expect(f.topicAction).not.toHaveBeenCalledWith(expect.objectContaining({ ownerLabel: 'first' }));
    expect(f.topicAction).toHaveBeenCalledTimes(2);

    expect(() => f.activation.intent({
      tab: 'connections', intent: 'open',
      payload: { kind: 'shell', id: 'zsh', ownerLabel: 'invented' }, tabPayload,
    }, f.capabilities)).toThrow('invalid open payload');
    expect(f.topicAction).toHaveBeenCalledTimes(2);
  });
});
