import { describe, it, expect, vi } from 'vitest';
import { ConnectionManager } from './manager.js';
import { SHELL_NAME } from '../shell-manager.js';
import type { Managers } from '../managers.js';

function makeManagers(overrides: Partial<Managers> = {}): Managers {
  return {
    shell: { has: vi.fn(() => false) },
    acp: { has: vi.fn(() => false), label: vi.fn(() => { /* no acp connection */ }) },
    monitor: { connectionsFor: vi.fn(() => []) },
    browser: { info: vi.fn(() => { /* no browser connection */ }), run: vi.fn(() => Promise.resolve('closed')) },
    pty: { terminalsFor: vi.fn(() => []) },
    database: { openDbs: vi.fn(() => []) },
    tab: { tabs: [], shorten: vi.fn((p: string) => p), cwdOf: vi.fn(() => '/repo'), startRunning: vi.fn(), finishRunning: vi.fn() },
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
  });

  describe('run', () => {
    it('closes a browser window via the browser manager and reports the output', async () => {
      const browserRun = vi.fn(() => Promise.resolve('Closed connection browser:1.'));
      const finishRunning = vi.fn();
      const managers = makeManagers({
        browser: { info: vi.fn(() => { /* no browser connection */ }), run: browserRun },
        tab: { tabs: [], shorten: vi.fn((p: string) => p), cwdOf: vi.fn(() => '/repo'), startRunning: vi.fn(), finishRunning },
      } as unknown as Partial<Managers>);
      const manager = new ConnectionManager(managers);

      manager.run('connection close browser:1', 'main');
      await Promise.resolve();
      await Promise.resolve();

      expect(browserRun).toHaveBeenCalledWith('main', 'browser window close 1');
      expect(finishRunning).toHaveBeenCalledWith('main', 'Closed connection browser:1.');
    });
  });
});
