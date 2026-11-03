import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from './manager.js';
import { SHELL_NAME } from '../shell/manager.js';
import type { Managers } from '../managers.js';
import type { CommandInvocationContext } from '../commands/types.js';

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: notifications.notify }));

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  return {
    shell: { has: vi.fn(() => false) },
    acp: { has: vi.fn(() => false), label: vi.fn(() => { /* no acp connection */ }) },
    monitor: { connectionsFor: vi.fn(() => []) },
    editorAcp: { connectionsFor: vi.fn(() => []) },
    browser: { info: vi.fn(() => { /* no browser connection */ }), run: vi.fn(() => Promise.resolve('closed')) },
    pty: { terminalsFor: vi.fn(() => []) },
    database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []) },
    tab: { tabs: [], byLabel: vi.fn(), shorten: vi.fn((p: string) => p), cwdOf: vi.fn(() => '/repo'), append: vi.fn(), appendForInvocation: vi.fn() },
    ...overrides,
  } as unknown as Managers;
}

describe('ConnectionManager', () => {
  describe('connectionsFor', () => {
    it('includes a shell row when a shell is open', () => {
      const managers = makeManagers({ shell: { has: vi.fn(() => true) } } as unknown as Partial<Managers>);
      const manager = new ConnectionManager(managers);

      const rows = manager.connectionsFor('main');

      expect(rows).toContainEqual({ text: `${SHELL_NAME}:/repo`, kind: 'shell' });
    });

    it('omits the shell row when no shell is open', () => {
      const managers = makeManagers();
      const manager = new ConnectionManager(managers);

      const rows = manager.connectionsFor('main');

      expect(rows.some((r) => r.kind === 'shell')).toBe(false);
    });

    it('includes the tab\'s own agent row with a tab-scoped acpRef', () => {
      const managers = makeManagers({ acp: { has: vi.fn(() => true), label: vi.fn(() => 'opencode') } } as unknown as Partial<Managers>);
      const manager = new ConnectionManager(managers);

      const rows = manager.connectionsFor('main');

      expect(rows).toContainEqual({ text: 'acp:opencode', kind: 'acp', acpRef: { scope: 'tab', label: 'main' } });
    });

    it('includes an editor tab\'s persona connection rows', () => {
      const managers = makeManagers({
        editorAcp: { connectionsFor: vi.fn(() => [{ text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } }]) },
      } as unknown as Partial<Managers>);
      const manager = new ConnectionManager(managers);

      const rows = manager.connectionsFor('notes');

      expect(rows).toContainEqual({ text: 'reviewer (acp)', kind: 'acp', acpRef: { scope: 'editor', label: 'notes', persona: 'reviewer' } });
    });

    it('leaves out connections only the app-wide list reaches', () => {
      const other = { label: 'bastion', harness: { name: 'ssh', ptyId: 'pty-1', destination: 'host' } };
      const managers = makeManagers({
        database: { openDbs: vi.fn(() => ['mine']), listOpen: vi.fn(() => ['mine', 'shared']) },
        tab: { tabs: [other], byLabel: vi.fn(), shorten: vi.fn((p: string) => p), cwdOf: vi.fn(() => '/repo') },
      } as unknown as Partial<Managers>);
      const manager = new ConnectionManager(managers);

      expect(manager.connectionsFor('main')).toEqual([{ text: 'sqlite:mine', kind: 'sqlite' }]);
    });
  });

  describe('run', () => {
    const invocation = { invocationId: 'inv-1' } as unknown as CommandInvocationContext;

    beforeEach(() => { notifications.notify.mockClear(); });

    it('writes the list through the invocation so a shell tab captures it', async () => {
      const managers = makeManagers({ database: { openDbs: vi.fn(() => ['mine']), listOpen: vi.fn(() => ['mine']) } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections list', 'shell', invocation);

      expect(managers.tab.appendForInvocation).toHaveBeenCalledWith('shell', { input: 'connections list', output: 'sqlite:mine' }, 'inv-1');
      expect(managers.tab.append).not.toHaveBeenCalled();
    });

    it('reports when nothing is open', async () => {
      const managers = makeManagers();

      await new ConnectionManager(managers).run('connections list', 'main');

      expect(managers.tab.append).toHaveBeenCalledWith('main', { input: 'connections list', output: 'No open connections.' });
    });

    it('writes a usage error through the invocation', async () => {
      const managers = makeManagers();

      await new ConnectionManager(managers).run('connections close', 'shell', invocation);

      expect(managers.tab.appendForInvocation).toHaveBeenCalledWith('shell', { input: 'connections close', output: 'Usage: connections close <kind>:<id>' }, 'inv-1');
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies a successful close and writes nothing to the transcript', async () => {
      const managers = makeManagers({ database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close: vi.fn(() => true) } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections close sqlite:mydb', 'main', invocation);

      expect(notifications.notify).toHaveBeenCalledWith(managers, 'connection-closed', 'main', 'Closed connection sqlite:mydb.');
      expect(managers.tab.appendForInvocation).not.toHaveBeenCalled();
    });

    it('sends an error notification when the connection does not exist', async () => {
      const managers = makeManagers({ database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close: vi.fn(() => false) } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections close sqlite:mydb', 'main');

      expect(notifications.notify).toHaveBeenCalledWith(managers, 'connection-close-failed', 'main', 'No open connection sqlite:mydb.');
    });

    it('sends an error notification when closing throws', async () => {
      const close = vi.fn(() => { throw new Error('database is locked.\nstack'); });
      const managers = makeManagers({ database: { openDbs: vi.fn(() => []), listOpen: vi.fn(() => []), close } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections close sqlite:mydb', 'main');

      expect(notifications.notify).toHaveBeenCalledWith(
        managers, 'connection-close-failed', 'main', 'Could not close connection sqlite:mydb: database is locked.',
      );
    });

    it('closes a browser window via the browser manager and notifies its result', async () => {
      const browserRun = vi.fn(() => Promise.resolve('Closed connection browser:1.'));
      const managers = makeManagers({ browser: { info: vi.fn(() => { /* no browser connection */ }), run: browserRun } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections close browser:1', 'main');

      expect(browserRun).toHaveBeenCalledWith('main', 'browser window close 1');
      expect(notifications.notify).toHaveBeenCalledWith(managers, 'connection-closed', 'main', 'Closed connection browser:1.');
    });

    it('sends an error notification when the browser window is not open', async () => {
      const browserRun = vi.fn(() => Promise.resolve('No open connection browser:9.'));
      const managers = makeManagers({ browser: { info: vi.fn(() => { /* no browser connection */ }), run: browserRun } } as unknown as Partial<Managers>);

      await new ConnectionManager(managers).run('connections close browser:9', 'main');

      expect(notifications.notify).toHaveBeenCalledWith(managers, 'connection-close-failed', 'main', 'No open connection browser:9.');
    });
  });
});
