import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';
import { composeConnectionsTopicData } from './connections-topic-rows.js';

function fixture() {
  const tabs: Tab[] = [
    { label: 'first', title: 'First tab', dotColor: '', number: 1, log: [], runtime: { busy: false, context: [], queue: [], lastActivity: 100 } },
    { label: 'second', dotColor: '', number: 2, log: [], runtime: { busy: false, context: [], queue: [], lastActivity: 300 } },
    {
      label: 'idle', dotColor: '', number: 3, log: [], runtime: { busy: false, context: [], queue: [] },
      plugin: { id: 'connections', instanceKey: 'core-record', schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'first' },
    },
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
      ['live', 'reviewer', 300],
      ['live', 'shared-db', 300],
      ['live', 'monitor-1', 100],
      ['live', 'term-a', 100],
      ['live', 'orphan-db', 0],
      ['record', 'agent-record', 200],
    ]);

    const core = data.rows.find((row) => row.type === 'record' && row.id === 'core-record');
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'acp' && row.ownerLabel === 'first'))
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'monitor-1' })]));
    expect(core).toMatchObject({ ownerName: 'First tab', orderingTimestamp: 400 });
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'sqlite')).toEqual([
      expect.objectContaining({
        id: 'shared-db', display: 'sqlite:shared-db', ownerName: 'global', ownerLabel: 'first',
        focusTarget: 'first', orderingTimestamp: 300,
      }),
      expect.objectContaining({
        id: 'orphan-db', display: 'sqlite:orphan-db', ownerName: 'global', ownerLabel: '',
        orderingTimestamp: 0,
      }),
    ]);
    expect(data.rows.find((row) => row.type === 'live' && row.id === 'orphan-db')).not.toHaveProperty('focusTarget');
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

  it('keeps a requested window while its plugin tab is docked or hidden and prunes it after the tab closes', () => {
    const { managers, tabs } = fixture();
    const recordTab = tabs.find((tab) => tab.plugin?.instanceKey === 'core-record')!;
    const requested = new Map([['core-record', 20]]);
    recordTab.dock = 'left';

    expect(composeConnectionsTopicData(managers, requested).rows
      .find((row) => row.type === 'record' && row.id === 'core-record'))
      .toMatchObject({ window: { id: 'core-record', count: 20 } });

    recordTab.hidden = true;
    expect(composeConnectionsTopicData(managers, requested).rows
      .find((row) => row.type === 'record' && row.id === 'core-record'))
      .toMatchObject({ window: { id: 'core-record', count: 20 } });
    expect(requested.has('core-record')).toBe(true);

    tabs.splice(tabs.indexOf(recordTab), 1);
    const closed = composeConnectionsTopicData(managers, requested).rows
      .find((row) => row.type === 'record' && row.id === 'core-record');
    expect(requested.has('core-record')).toBe(false);
    expect(closed).not.toHaveProperty('window');
  });

  it('starts a reopened record tab without a window until it requests one again', () => {
    const { managers, tabs } = fixture();
    const recordTab = tabs.find((tab) => tab.plugin?.instanceKey === 'core-record')!;
    const requested = new Map<string, number>([['core-record', 20]]);
    tabs.splice(tabs.indexOf(recordTab), 1);
    composeConnectionsTopicData(managers, requested);
    expect(requested.size).toBe(0);

    tabs.push(recordTab);
    expect(composeConnectionsTopicData(managers, requested).rows
      .find((row) => row.type === 'record' && row.id === 'core-record'))
      .not.toHaveProperty('window');

    requested.set('core-record', 20);
    expect(composeConnectionsTopicData(managers, requested).rows
      .find((row) => row.type === 'record' && row.id === 'core-record'))
      .toMatchObject({ window: { id: 'core-record', count: 20 } });
  });

  it('reads Local for local tabs, SQLite databases, and records captured without a host', () => {
    const { managers } = fixture();
    const rows = composeConnectionsTopicData(managers, new Map()).rows;
    expect(new Set(rows.map((row) => row.host))).toEqual(new Set(['Local']));
  });

  it('reads the bare remote host for a remote tab and an ssh tab, keeping SQLite Local', () => {
    const { managers, tabs } = fixture();
    tabs[1]!.remote = { address: 'me@devbox:/srv/repo', host: 'devbox' };
    tabs.push({
      label: 'ssh-tab', dotColor: '', number: 4, log: [],
      harness: { name: 'ssh', destination: 'ops@jump-host' },
    } as unknown as Tab);
    const rows = composeConnectionsTopicData(managers, new Map()).rows;
    const hostOf = (id: string) => rows.find((row) => row.id === id)?.host;

    expect(hostOf('reviewer')).toBe('devbox');
    expect(rows.find((row) => row.kind === 'ssh' && row.ownerLabel === 'second')?.host).toBe('devbox');
    expect(rows.find((row) => row.kind === 'ssh' && row.ownerLabel === 'ssh-tab')?.host).toBe('jump-host');
    expect(hostOf('monitor-1')).toBe('Local');
    expect(hostOf('shared-db')).toBe('Local');
  });

  it('carries the host captured on a record', () => {
    const { managers, recordRows } = fixture();
    Object.assign(recordRows[1]!, { host: 'build-box' });
    const rows = composeConnectionsTopicData(managers, new Map()).rows;
    expect(rows.find((row) => row.id === 'agent-record')?.host).toBe('build-box');
    expect(rows.find((row) => row.id === 'core-record')?.host).toBe('Local');
  });

  it('groups rows by host, Local first and then other hosts alphabetically whatever their activity', () => {
    const { managers, recordRows, tabs } = fixture();
    tabs[1]!.remote = { address: 'me@devbox:/srv/repo', host: 'devbox' };
    tabs.push({
      label: 'ssh-tab', dotColor: '', number: 4, log: [],
      harness: { name: 'ssh', destination: 'ops@Zeta-host' },
      runtime: { busy: false, context: [], queue: [], lastActivity: 9999 },
    } as unknown as Tab);
    Object.assign(recordRows[1]!, { host: 'alpha', updatedAt: 8000, status: 'Idle' });

    const rows = composeConnectionsTopicData(managers, new Map()).rows;
    const hosts = rows.map((row) => row.host);
    const groups = ['Local', 'alpha', 'devbox', 'Zeta-host'];

    expect(hosts.filter((host, index) => hosts.indexOf(host) === index)).toEqual(groups);
    expect(hosts).toEqual(hosts.toSorted((left, right) => groups.indexOf(left) - groups.indexOf(right)));
    expect(rows.find((row) => row.ownerLabel === 'ssh-tab')?.orderingTimestamp).toBe(9999);
  });

  it('puts open rows above closed rows within a host, each ordered by most recent activity', () => {
    const { managers, recordRows } = fixture();
    recordRows[1]!.updatedAt = 5000;
    recordRows.push(
      { id: 'idle-record', kind: 'acp', title: 'ACP: idle', model: 'model-a', ownerLabel: 'closed-owner', ownerName: 'Idle owner', startedAt: 3, updatedAt: 50, status: 'Idle' },
      { id: 'old-closed', kind: 'acp', title: 'ACP: old', model: 'model-a', ownerLabel: 'closed-owner', ownerName: 'Old owner', startedAt: 4, updatedAt: 10, status: 'Failed' },
    );

    const rows = composeConnectionsTopicData(managers, new Map()).rows;

    expect(rows.map((row) => [row.id, row.status, row.orderingTimestamp])).toEqual([
      ['core-record', 'Running', 400],
      ['reviewer', 'Open', 300],
      ['shared-db', 'Open', 300],
      ['monitor-1', 'Open', 100],
      ['term-a', 'Open', 100],
      ['idle-record', 'Idle', 50],
      ['orphan-db', 'Open', 0],
      ['agent-record', 'Completed', 5000],
      ['old-closed', 'Failed', 10],
    ]);
  });

  it('groups closed rows below every open row across hosts, keeping host order inside each grouping', () => {
    const { managers, recordRows, tabs } = fixture();
    tabs[1]!.remote = { address: 'me@devbox:/srv/repo', host: 'devbox' };
    recordRows.push(
      { id: 'remote-closed', kind: 'acp', title: 'ACP: remote', model: 'model-a', ownerLabel: 'closed-owner', ownerName: 'Remote owner', startedAt: 3, updatedAt: 9000, status: 'Closed' },
      { id: 'local-closed', kind: 'acp', title: 'ACP: local', model: 'model-a', ownerLabel: 'closed-owner', ownerName: 'Local owner', startedAt: 4, updatedAt: 10, status: 'Terminated' },
    );
    Object.assign(recordRows[2]!, { host: 'devbox' });

    const rows = composeConnectionsTopicData(managers, new Map()).rows;
    const closed = rows.filter((row) => ['Closed', 'Completed', 'Failed', 'Terminated'].includes(row.status));

    expect(rows.slice(-closed.length)).toEqual(closed);
    expect(rows.slice(0, -closed.length).at(-1)).toMatchObject({ host: 'devbox', status: 'Open' });
    expect(closed.map((row) => [row.id, row.host])).toEqual([
      ['agent-record', 'Local'],
      ['local-closed', 'Local'],
      ['remote-closed', 'devbox'],
    ]);
  });

  it('keeps the SQLite owner display global while focus follows strip order independently', () => {
    const { managers, tabs } = fixture();
    tabs[0]!.title = 'Renamed first';
    tabs.reverse();

    let data = composeConnectionsTopicData(managers, new Map());
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'sqlite')).toEqual([
      expect.objectContaining({
        id: 'shared-db', display: 'sqlite:shared-db', ownerName: 'global',
        ownerLabel: 'second', focusTarget: 'second',
      }),
      expect.objectContaining({ id: 'orphan-db', ownerName: 'global', ownerLabel: '' }),
    ]);
    expect(data.rows.filter((row) => row.type === 'live' && row.kind === 'sqlite')).toHaveLength(2);

    managers.database.openDbs = vi.fn(() => []) as unknown as typeof managers.database.openDbs;
    data = composeConnectionsTopicData(managers, new Map());
    const rows = data.rows.filter((row) => row.type === 'live' && row.kind === 'sqlite');
    expect(rows).toEqual([
      expect.objectContaining({ id: 'orphan-db', display: 'sqlite:orphan-db', ownerName: 'global', ownerLabel: '' }),
      expect.objectContaining({ id: 'shared-db', display: 'sqlite:shared-db', ownerName: 'global', ownerLabel: '' }),
    ]);
    for (const row of rows) expect(row).not.toHaveProperty('focusTarget');
  });

  it('names a record\'s owning tab as its focus target only while the tab it began in is open', () => {
    const { managers, recordRows, tabs } = fixture();
    tabs[0]!.runtime!.acpRecordIds = new Set(['core-record']);
    const focusOf = () => composeConnectionsTopicData(managers, new Map()).rows
      .find((row) => row.type === 'record' && row.id === 'core-record')?.focusTarget;

    expect(focusOf()).toBe('first');
    recordRows[0]!.status = 'Closed';
    delete tabs[0]!.runtime!.acpRecordId;
    expect(focusOf()).toBe('first');

    tabs[0] = { label: 'first', dotColor: '', number: 1, log: [], runtime: { busy: false, context: [], queue: [] } };
    expect(focusOf()).toBeUndefined();
    tabs.shift();
    expect(focusOf()).toBeUndefined();
    expect(composeConnectionsTopicData(managers, new Map()).rows
      .find((row) => row.type === 'record' && row.id === 'agent-record')).not.toHaveProperty('focusTarget');
  });

  it('marks only the managed system tab shell rows permanent', () => {
    const { managers, tabs } = fixture();
    tabs.push({
      label: 'system', dotColor: '', number: 4, log: [], systemShell: true,
      runtime: { busy: false, context: [], queue: [] },
    });
    managers.shell.has = vi.fn((label: string) => ['first', 'system'].includes(label));
    managers.pty.terminalsFor = vi.fn((label: string) => (['first', 'system'].includes(label) ? ['zsh'] : []));
    managers.browser.info = vi.fn((label: string) => (label === 'system' ? { ids: ['w1'], mode: 'headless' } : null)) as unknown as typeof managers.browser.info;

    const live = composeConnectionsTopicData(managers, new Map()).rows.filter((row) => row.type === 'live');
    const owned = (label: string) => live.filter((row) => row.ownerLabel === label && row.kind !== 'sqlite');

    expect(owned('system').map((row) => [row.kind, 'permanent' in row ? row.permanent : undefined])).toEqual([
      ['browser', undefined],
      ['shell', true],
      ['terminal', true],
    ]);
    for (const row of owned('first')) expect(row).not.toHaveProperty('permanent');
    expect(owned('first').map((row) => row.kind)).toEqual(expect.arrayContaining(['shell', 'terminal']));
  });
});
