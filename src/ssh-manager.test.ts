import { describe, it, expect, vi } from 'vitest';
import { SshManager } from './ssh-manager.js';
import { makeTab } from './tab/index.js';
import type { Managers } from './managers.js';
import type { Tab } from './tab/types.js';

function makeManagers(): { managers: Managers; tabs: Tab[] } {
  const creator = makeTab('janus', 'red', 1, [], [], undefined, 1, 'red');
  const tabs: Tab[] = [creator];
  const managers = {
    tab: {
      tabs,
      cur: () => creator,
      cwdOf: () => '/work',
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      setActiveTab: vi.fn(),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    },
    pty: { spawn: vi.fn(() => 'pty-1') },
    harness: { registerSshObservers: vi.fn() },
  } as unknown as Managers;
  return { managers, tabs };
}

describe('SshManager.run', () => {
  it('records the invocation options on the tab, leaving destination untouched', () => {
    const { managers, tabs } = makeManagers();

    expect(new SshManager(managers).run('ssh host -p 2222')).toBeUndefined();

    expect(tabs.at(-1)?.harness).toEqual(expect.objectContaining({
      name: 'ssh', destination: 'host', sshOptions: ['-p', '2222'],
    }));
  });

  it('omits sshOptions entirely when the invocation carries none', () => {
    const { managers, tabs } = makeManagers();

    new SshManager(managers).run('ssh host');

    expect(tabs.at(-1)?.harness?.sshOptions).toBeUndefined();
    expect(tabs.at(-1)?.harness?.destination).toBe('host');
  });

  it('returns the usage error and opens no tab for an unparseable invocation', () => {
    const { managers, tabs } = makeManagers();

    expect(new SshManager(managers).run('ssh')).toMatch(/Usage/i);
    expect(tabs).toHaveLength(1);
  });

  it('registers the ssh observers with the PTY id, the tab label, and the verbatim invocation', () => {
    const { managers } = makeManagers();

    new SshManager(managers).run('ssh admin@host -p 2222');

    expect(managers.harness.registerSshObservers).toHaveBeenCalledWith('pty-1', 'host', 'ssh admin@host -p 2222');
  });

  it('gives a second session to the same destination its own label, so recordings cannot collide', () => {
    const { managers } = makeManagers();
    const manager = new SshManager(managers);

    manager.run('ssh devbox');
    manager.run('ssh devbox');

    expect(managers.harness.registerSshObservers).toHaveBeenNthCalledWith(1, 'pty-1', 'devbox', 'ssh devbox');
    expect(managers.harness.registerSshObservers).toHaveBeenNthCalledWith(2, 'pty-1', 'devbox-2', 'ssh devbox');
  });
});
