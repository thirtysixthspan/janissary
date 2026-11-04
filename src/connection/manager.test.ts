import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from './manager.js';
import { SHELL_NAME } from '../shell/manager.js';
import type { Managers } from '../managers.js';

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: notifications.notify }));

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  return {
    shell: { has: vi.fn(() => false) },
    acp: { has: vi.fn(() => false), label: vi.fn() },
    monitor: { connectionsFor: vi.fn(() => []) },
    editorAcp: { connectionsFor: vi.fn(() => []) },
    browser: { info: vi.fn(), run: vi.fn(() => Promise.resolve('closed')) },
    pty: { terminalsFor: vi.fn(() => []) },
    database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []) },
    agent: { runs: new Map() },
    tab: {
      tabs: [],
      byLabel: vi.fn((label: string) => ({ label, runtime: { incarnation: `inc-${label}` } })),
      shorten: vi.fn((value: string) => value),
      cwdOf: vi.fn(() => '/repo'),
    },
    ...overrides,
  } as unknown as Managers;
}

describe('ConnectionManager closeTarget', () => {
  beforeEach(() => { notifications.notify.mockClear(); });

  it('reports successful synchronous close results', () => {
    const managers = makeManagers({
      database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close: vi.fn(() => true) },
    } as unknown as Partial<Managers>);
    new ConnectionManager(managers).closeTarget('sqlite', 'inventory', 'owner');
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'connection-closed', 'owner', 'Closed connection sqlite:inventory.',
    );
  });

  it('reports a missing target through the existing notification', () => {
    const managers = makeManagers({
      database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close: vi.fn(() => false) },
    } as unknown as Partial<Managers>);
    new ConnectionManager(managers).closeTarget('sqlite', 'missing', 'owner');
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'connection-close-failed', 'owner', 'No open connection sqlite:missing.',
    );
  });

  it('converts thrown close errors to the first-line notification', () => {
    const managers = makeManagers({
      database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close: vi.fn(() => { throw new Error('locked\nmore'); }) },
    } as unknown as Partial<Managers>);
    new ConnectionManager(managers).closeTarget('sqlite', 'inventory', 'owner');
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'connection-close-failed', 'owner', 'Could not close connection sqlite:inventory: locked.',
    );
  });

  it('starts browser close without awaiting and reports its eventual result', async () => {
    const pending = Promise.withResolvers<string>();
    const browserRun = vi.fn(() => pending.promise);
    const managers = makeManagers({ browser: { info: vi.fn(), run: browserRun } } as unknown as Partial<Managers>);
    new ConnectionManager(managers).closeTarget('browser', 'window-1', 'owner');
    expect(browserRun).toHaveBeenCalledWith('owner', 'browser window close window-1');
    expect(notifications.notify).not.toHaveBeenCalled();
    pending.resolve('Closed connection browser:window-1.');
    await pending.promise;
    await Promise.resolve();
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'connection-closed', 'owner', 'Closed connection browser:window-1.',
    );
  });
});

describe('ConnectionManager connectionsFor', () => {
  it('includes the tab-owned shell and ACP connections', () => {
    const managers = makeManagers({
      shell: { has: vi.fn(() => true) },
      acp: { has: vi.fn(() => true), label: vi.fn(() => 'opencode') },
    } as unknown as Partial<Managers>);
    expect(new ConnectionManager(managers).connectionsFor('main')).toContainEqual(
      { text: `${SHELL_NAME}:/repo`, kind: 'shell' },
    );
    expect(new ConnectionManager(managers).connectionsFor('main')).toContainEqual(
      { text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'main' } },
    );
  });

  it('omits the shell connection when no shell is open', () => {
    expect(new ConnectionManager(makeManagers()).connectionsFor('main').some((row) => row.kind === 'shell')).toBe(false);
  });

  it('includes editor ACP rows with their owner reference', () => {
    const managers = makeManagers({
      editorAcp: {
        connectionsFor: vi.fn(() => [{
          text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' },
        }]),
      },
    } as unknown as Partial<Managers>);
    expect(new ConnectionManager(managers).connectionsFor('notes')).toContainEqual({
      text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' },
    });
  });

  it('keeps global-only connections out of a tab-owned projection', () => {
    const managers = makeManagers({
      database: { openDbs: vi.fn(() => ['mine']), listOpen: vi.fn(() => ['mine', 'shared']) },
    } as unknown as Partial<Managers>);
    expect(new ConnectionManager(managers).connectionsFor('main')).toEqual([
      { text: 'sqlite:mine', kind: 'sqlite' },
    ]);
  });

  it('includes an active caller-owned agent run once with its record id and no acpRef', () => {
    const run = { caller: { label: 'main', incarnation: 'inc-main' }, recordId: 'record-1', view: () => ({ task: 'task.md' }) };
    const managers = makeManagers({
      agent: { runs: new Map([['run-1', run]]) },
    } as unknown as Partial<Managers>);
    const rows = new ConnectionManager(managers).connectionsFor('main');
    const agentRows = rows.filter((row) => row.text.startsWith('Agent: '));
    expect(agentRows).toEqual([{ text: 'Agent: task.md', kind: 'acp', recordId: 'record-1' }]);
    expect(agentRows[0]).not.toHaveProperty('acpRef');
  });

  it('omits another caller\'s run, completed runs, and runs without a record id', () => {
    const managers = makeManagers({
      agent: {
        runs: new Map([
          ['run-1', { caller: { label: 'other', incarnation: 'inc-other' }, recordId: 'record-1', view: () => ({ task: 'other.md' }) }],
          ['run-2', { caller: { label: 'main', incarnation: 'inc-main' }, recordId: 'record-2', outcome: 'completed', view: () => ({ task: 'done.md' }) }],
          ['run-3', { caller: { label: 'main', incarnation: 'inc-main' }, view: () => ({ task: 'unrecorded.md' }) }],
        ]),
      },
    } as unknown as Partial<Managers>);
    expect(new ConnectionManager(managers).connectionsFor('main').some((row) => row.text.startsWith('Agent: '))).toBe(false);
  });

  it('omits a live run captured from a previous incarnation of the same label', () => {
    const managers = makeManagers({
      agent: {
        runs: new Map([
          ['run-1', { caller: { label: 'main', incarnation: 'inc-main' }, recordId: 'record-1', view: () => ({ task: 'current.md' }) }],
          ['run-2', { caller: { label: 'main', incarnation: 'inc-previous' }, recordId: 'record-2', view: () => ({ task: 'stale.md' }) }],
        ]),
      },
    } as unknown as Partial<Managers>);
    const agentRows = new ConnectionManager(managers).connectionsFor('main')
      .filter((row) => row.text.startsWith('Agent: '));
    expect(agentRows).toEqual([{ text: 'Agent: current.md', kind: 'acp', recordId: 'record-1' }]);
    expect(agentRows[0]).not.toHaveProperty('acpRef');
  });

  it('omits agent rows when no tab holds the caller label', () => {
    const managers = makeManagers({
      agent: {
        runs: new Map([['run-1', { caller: { label: 'main', incarnation: 'inc-main' }, recordId: 'record-1', view: () => ({ task: 'task.md' }) }]]),
      },
      tab: { tabs: [], byLabel: vi.fn(), shorten: vi.fn((value: string) => value), cwdOf: vi.fn(() => '/repo') },
    } as unknown as Partial<Managers>);
    expect(new ConnectionManager(managers).connectionsFor('main').some((row) => row.text.startsWith('Agent: '))).toBe(false);
  });

  it('keeps an agent row distinct from the tab\'s catalog rows', () => {
    const managers = makeManagers({
      shell: { has: vi.fn(() => true) },
      agent: {
        runs: new Map([['run-1', { caller: { label: 'main', incarnation: 'inc-main' }, recordId: 'record-1', view: () => ({ task: 'task.md' }) }]]),
      },
    } as unknown as Partial<Managers>);
    const rows = new ConnectionManager(managers).connectionsFor('main');
    expect(rows.filter((row) => row.text === `${SHELL_NAME}:/repo`)).toHaveLength(1);
    expect(rows.filter((row) => row.text === 'Agent: task.md')).toHaveLength(1);
  });
});
