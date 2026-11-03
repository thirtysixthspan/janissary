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
    tab: { tabs: [], byLabel: vi.fn(), shorten: vi.fn((value: string) => value), cwdOf: vi.fn(() => '/repo') },
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
});
