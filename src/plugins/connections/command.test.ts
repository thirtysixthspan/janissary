import { describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import { runConnectionsCommand } from './command.js';
import { ConnectionTabs } from './tabs.js';

function fixture(rows: unknown[] = [], originLabel = 'owner') {
  const topicAction = vi.fn((_action: { action?: string }) => 'No open connections.');
  const note = vi.fn();
  const rejectRequest = vi.fn((reason: string): never => { throw new Error(reason); });
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn((_key: string, _factory: () => unknown) => {});
  const dockTab = vi.fn();
  const topicData = vi.fn(() => ({ rows }));
  const originTab = vi.fn(() => ({ label: originLabel, cwd: '/repo', root: '/repo' }));
  const capabilities = {
    topicAction, note, rejectRequest, openOrFocusTab, updateTab, dockTab, topicData, originTab,
    reportFailure: vi.fn((reason: string): never => { throw new Error(reason); }),
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, topicAction, note, rejectRequest, openOrFocusTab, updateTab, dockTab, topicData, originTab };
}

function recordRow(id: string, title: string, updatedAt: number) {
  return {
    type: 'record', id, kind: 'acp', title, model: 'model', host: 'Local', ownerLabel: 'other',
    ownerName: 'Other', startedAt: 1, updatedAt, status: 'Closed', orderingTimestamp: updatedAt,
  };
}

describe('connections command', () => {
  it('routes list output through the topic action and note', () => {
    const f = fixture();
    const tabs = new ConnectionTabs();
    runConnectionsCommand('list trailing', 'connections', tabs, f.capabilities);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'list', label: 'owner' });
    expect(f.note).toHaveBeenCalledWith('No open connections.');
  });

  it('sends parser failures to note and command closes through closeCommand', () => {
    const f = fixture();
    const tabs = new ConnectionTabs();
    runConnectionsCommand('close', 'connections', tabs, f.capabilities);
    expect(f.note).toHaveBeenCalledWith('Usage: connections close <kind>:<id>');
    expect(f.rejectRequest).not.toHaveBeenCalled();

    runConnectionsCommand('close browser:w1 trailing', 'connections', tabs, f.capabilities);
    expect(f.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'closeCommand', kind: 'browser', id: 'w1', label: 'owner',
    });
  });

  it('opens the matching live owner and rejects an unmatched title', () => {
    const row = {
      type: 'live', id: 'db', kind: 'sqlite', display: 'sqlite:db', host: 'Local', ownerLabel: 'owner', ownerName: 'Owner',
      status: 'Open', orderingTimestamp: 1,
    };
    const f = fixture([row]);
    const tabs = new ConnectionTabs();
    runConnectionsCommand('sqlite:db', 'connection', tabs, f.capabilities);
    expect(f.topicAction).toHaveBeenCalledWith({
      topic: 'connections', action: 'open', kind: 'sqlite', id: 'db', ownerLabel: 'owner',
    });
    expect(() => runConnectionsCommand('absent', 'connections', tabs, f.capabilities))
      .toThrow('No connection matching "absent".');
  });

  it('prefers the invoking tab own shell row when two tabs expose the same id', () => {
    const first = {
      type: 'live', id: 'zsh', kind: 'shell', display: 'shell:~/first', host: 'Local', ownerLabel: 'first', ownerName: 'First',
      status: 'Open', orderingTimestamp: 1,
    };
    const second = {
      ...first, display: 'shell:~/second', ownerLabel: 'second', ownerName: 'Second',
    };

    const mine = fixture([first, second], 'second');
    runConnectionsCommand('shell:zsh', 'connection', new ConnectionTabs(), mine.capabilities);
    expect(mine.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'second',
    });

    const unrelated = fixture([first, second], 'third');
    runConnectionsCommand('shell:zsh', 'connections', new ConnectionTabs(), unrelated.capabilities);
    expect(unrelated.topicAction).toHaveBeenLastCalledWith({
      topic: 'connections', action: 'open', kind: 'shell', id: 'zsh', ownerLabel: 'first',
    });
  });

  it('resolves UUID before acp reference and opens a record before requesting its window', () => {
    const record = {
      type: 'record', id: 'uuid', kind: 'acp', title: 'ACP title', model: 'model', host: 'Local', ownerLabel: 'owner',
      ownerName: 'Owner', startedAt: 1, updatedAt: 2, status: 'Running', orderingTimestamp: 2,
    };
    const window = {
      id: 'uuid',
      source: { kind: 'acp', model: 'model', ownerLabel: 'owner', ownerName: 'Owner' },
      blocks: Array.from({ length: 20 }, (_, index) => ({ prompt: `prompt ${index}`, startedAt: index, entries: [] })),
      totalBlocks: 25,
      offset: 5,
      hasOlder: true,
    };
    const f = fixture([record]);
    let loaded = false;
    f.topicAction.mockImplementation((action) => {
      if (action.action === 'load') loaded = true;
      return 'connections output';
    });
    f.topicData.mockImplementation(() => ({ rows: [{ ...record, ...(loaded && { window }) }] }));
    const tabs = new ConnectionTabs();

    runConnectionsCommand('uuid', 'connection', tabs, f.capabilities);

    expect(f.openOrFocusTab).toHaveBeenCalledWith('uuid', expect.any(Function));
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid' });
    expect(f.openOrFocusTab.mock.invocationCallOrder[0]).toBeLessThan(f.topicAction.mock.invocationCallOrder[0]);
    expect(f.updateTab).toHaveBeenCalledWith('uuid', expect.any(Function));
    const [key, refresh] = f.updateTab.mock.calls[0];
    expect(key).toBe('uuid');
    expect(refresh()).toMatchObject({ title: 'acp:Owner', payload: { kind: 'connection', record: { id: 'uuid', window } } });
  });

  it.each(['connection', 'connections'] as const)(
    'passes the complete multiword title through %s and opens the newest match',
    (name) => {
      const f = fixture([
        recordRow('older', 'ACP: EXPLAIN THIS TEST', 100),
        recordRow('newer', 'ACP: explain this test', 300),
      ]);
      const tabs = new ConnectionTabs();
      runConnectionsCommand('  ACP: Explain This Test  ', name, tabs, f.capabilities);
      expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'newer' });
      expect(f.openOrFocusTab).toHaveBeenCalledWith('newer', expect.any(Function));
      expect(f.rejectRequest).not.toHaveBeenCalled();
    },
  );

  it.each(['connection', 'connections'] as const)(
    'keeps live kind/id action identity and owner forwarding through %s',
    (name) => {
      const live = {
        type: 'live', id: 'shared', kind: 'sqlite', display: 'sqlite:shared', host: 'Local', ownerLabel: 'second',
        ownerName: 'global', status: 'Open', orderingTimestamp: 1, focusTarget: 'second',
      };
      const f = fixture([live]);
      const tabs = new ConnectionTabs();
      runConnectionsCommand('sqlite:shared', name, tabs, f.capabilities);
      expect(f.topicAction).toHaveBeenCalledWith({
        topic: 'connections', action: 'open', kind: 'sqlite', id: 'shared', ownerLabel: 'second',
      });
      expect(f.openOrFocusTab).not.toHaveBeenCalled();
      expect(f.rejectRequest).not.toHaveBeenCalled();
    },
  );

  it.each(['connection', 'connections'] as const)(
    'rejects an exact full-text miss through %s without shortening the text',
    (name) => {
      const f = fixture([recordRow('spaced', 'ACP: explain  this test', 100)]);
      const tabs = new ConnectionTabs();
      const query = 'ACP: Explain   This Test';
      expect(() => runConnectionsCommand(query, name, tabs, f.capabilities))
        .toThrow(`No connection matching "${query}".`);
      expect(f.openOrFocusTab).not.toHaveBeenCalled();
    },
  );

  it('resolves the invoking tab ACP reference before a newer same-model record owned elsewhere', () => {
    const other = { ...recordRow('other', 'ACP: other', 300), ownerLabel: 'elsewhere', status: 'Idle' };
    const mine = { ...recordRow('mine', 'ACP: mine', 100), ownerLabel: 'owner', status: 'Idle' };
    const f = fixture([other, mine]);
    const tabs = new ConnectionTabs();
    runConnectionsCommand('acp:model', 'connection', tabs, f.capabilities);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'mine' });
    expect(f.openOrFocusTab).toHaveBeenCalledWith('mine', expect.any(Function));
  });

  it.each(['connection', 'connections'] as const)(
    'resolves an unattributed SQLite row through %s without inventing an owner',
    (name) => {
      const live = {
        type: 'live', id: 'orphan', kind: 'sqlite', display: 'sqlite:orphan', host: 'Local', ownerLabel: '',
        ownerName: 'global', status: 'Open', orderingTimestamp: 0,
      };
      const f = fixture([live]);
      const tabs = new ConnectionTabs();
      runConnectionsCommand('sqlite:orphan', name, tabs, f.capabilities);
      expect(f.topicAction).toHaveBeenCalledWith({
        topic: 'connections', action: 'open', kind: 'sqlite', id: 'orphan', ownerLabel: '',
      });
      expect(f.openOrFocusTab).not.toHaveBeenCalled();
      expect(f.rejectRequest).not.toHaveBeenCalled();
    },
  );
});
