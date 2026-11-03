import { describe, expect, it, vi } from 'vitest';
import type { TabPluginServerCapabilities } from '../api.js';
import { runConnectionsCommand } from './command.js';
import { ConnectionTabs } from './tabs.js';

function fixture(rows: unknown[] = []) {
  const topicAction = vi.fn(() => 'No open connections.');
  const note = vi.fn();
  const rejectRequest = vi.fn((reason: string): never => { throw new Error(reason); });
  const openOrFocusTab = vi.fn();
  const updateTab = vi.fn();
  const dockTab = vi.fn();
  const topicData = vi.fn(() => ({ rows }));
  const originTab = vi.fn(() => ({ label: 'owner', cwd: '/repo', root: '/repo' }));
  const capabilities = {
    topicAction, note, rejectRequest, openOrFocusTab, updateTab, dockTab, topicData, originTab,
    reportFailure: vi.fn((reason: string): never => { throw new Error(reason); }),
  } as unknown as TabPluginServerCapabilities;
  return { capabilities, topicAction, note, rejectRequest, openOrFocusTab, dockTab, topicData, originTab };
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
      type: 'live', id: 'db', kind: 'sqlite', display: 'sqlite:db', ownerLabel: 'owner', ownerName: 'Owner',
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

  it('resolves UUID before acp reference and opens a record after requesting its window', () => {
    const record = {
      type: 'record', id: 'uuid', kind: 'acp', title: 'ACP title', model: 'model', ownerLabel: 'owner',
      ownerName: 'Owner', startedAt: 1, updatedAt: 2, status: 'Running', orderingTimestamp: 2,
    };
    const f = fixture([record]);
    const tabs = new ConnectionTabs();
    runConnectionsCommand('uuid', 'connection', tabs, f.capabilities);
    expect(f.topicAction).toHaveBeenCalledWith({ topic: 'connections', action: 'load', id: 'uuid' });
    expect(f.openOrFocusTab).toHaveBeenCalledWith('uuid', expect.any(Function));
  });
});
