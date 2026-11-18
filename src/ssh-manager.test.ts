import { afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SshManager } from './ssh-manager.js';
import { makePluginTab, makeTab } from './tab/index.js';
import type { Managers } from './managers.js';
import type { Tab } from './tab/types.js';
import { wireControllerEvents } from './controller/events.js';
import { messageBus } from './bus.js';
import { notify } from './notifications/index.js';

const dirs = vi.hoisted(() => ({ home: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, homedir: () => dirs.home };
});
vi.mock('./notifications/index.js', () => ({ notify: vi.fn() }));

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  tempRoots.length = 0;
  vi.mocked(notify).mockReset();
});

function makeManagers(
  projectHosts?: string, homeHosts?: string, creatorGroup?: { group: number; groupColor: string },
): { managers: Managers; tabs: Tab[]; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-ssh-saved-'));
  tempRoots.push(root);
  const home = path.join(root, 'home');
  dirs.home = home;
  mkdirSync(path.join(home, '.janissary'), { recursive: true });
  mkdirSync(path.join(root, '.janissary'), { recursive: true });
  if (projectHosts !== undefined) writeFileSync(path.join(root, '.janissary', 'hosts.json'), projectHosts);
  if (homeHosts !== undefined) writeFileSync(path.join(home, '.janissary', 'hosts.json'), homeHosts);
  const creator = makeTab('janus', 'red', 1, [], [], undefined, creatorGroup?.group ?? 1, creatorGroup?.groupColor ?? 'red');
  const tabs: Tab[] = [creator];
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((t: Tab) => t.label === label),
      cur: () => creator,
      launchDir: root,
      cwdOf: vi.fn(() => '/work'),
      insertTabInGroup: (tab: Tab) => { tabs.push(tab); },
      setActiveTab: vi.fn(),
      findIndex: (label: string) => tabs.findIndex((t) => t.label === label),
    },
    pty: { spawn: vi.fn(() => 'pty-1') },
    terminalRuntime: { registerSshObservers: vi.fn() },
  } as unknown as Managers;
  return { managers, tabs, root };
}

describe('SshManager.run', () => {
  it('still closes a plain ssh tab on PTY exit without reconnecting', () => {
    const { managers, tabs } = makeManagers();
    const reconnect = vi.fn(), closeTab = vi.fn();
    managers.tab.closeTab = closeTab;
    managers.tab.harnessTabByPtyId = ((id: string) => tabs.find((tab) => tab.harness?.ptyId === id)) as Managers['tab']['harnessTabByPtyId'];
    managers.remote = { create: reconnect } as unknown as Managers['remote'];
    new SshManager(managers).run('ssh host');
    wireControllerEvents(managers, { emitState: vi.fn(), sendPty: vi.fn(), sendPtyExit: vi.fn() });
    try {
      messageBus.emit('pty', { type: 'exit', id: 'pty-1', exitCode: 255 });
      expect(closeTab).toHaveBeenCalledExactlyOnceWith(1);
      expect(reconnect).not.toHaveBeenCalled();
    } finally { messageBus.clear(); }
  });
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

    expect(managers.terminalRuntime.registerSshObservers).toHaveBeenCalledWith('pty-1', 'host', 'ssh admin@host -p 2222');
  });

  // The sessions list carries a row for every plain ssh tab and is composed from this manager's
  // tabs, so opening one has to announce itself: a docked list never regains focus and so never
  // re-reads on its own.
  it('announces the new connection on the sessions channel', () => {
    const { managers } = makeManagers();
    const changed = vi.fn();
    const sub = messageBus.on('sessions', 'changed', changed);

    try {
      new SshManager(managers).run('ssh host');
      expect(changed).toHaveBeenCalledOnce();
    } finally { sub.unsubscribe(); }
  });

  it('announces nothing when the invocation opened no tab', () => {
    const { managers } = makeManagers();
    const changed = vi.fn();
    const sub = messageBus.on('sessions', 'changed', changed);

    try {
      new SshManager(managers).run('ssh');
      expect(changed).not.toHaveBeenCalled();
    } finally { sub.unsubscribe(); }
  });

  it('gives a second session to the same destination its own label, so recordings cannot collide', () => {
    const { managers } = makeManagers();
    const manager = new SshManager(managers);

    manager.run('ssh devbox');
    manager.run('ssh devbox');

    expect(managers.terminalRuntime.registerSshObservers).toHaveBeenNthCalledWith(1, 'pty-1', 'devbox', 'ssh devbox');
    expect(managers.terminalRuntime.registerSshObservers).toHaveBeenNthCalledWith(2, 'pty-1', 'devbox-2', 'ssh devbox');
  });

  it('uses a case-folded saved name with the real destination, port and path', () => {
    const { managers, tabs } = makeManagers(JSON.stringify({
      lab: { user: 'ops', destination: 'lab.example:2222', path: '~/work' },
    }));

    expect(new SshManager(managers).run('ssh LAB')).toBeUndefined();

    expect(tabs.at(-1)?.label).toBe('lab');
    expect(tabs.at(-1)?.harness).toEqual(expect.objectContaining({
      destination: 'ops@lab.example', hostName: 'lab',
    }));
    const command = vi.mocked(managers.pty.spawn).mock.calls[0][2];
    expect(command).toContain('-p 2222 -t --');
    expect(command).toContain('"$HOME"/');
    expect(tabs.at(-1)?.harness?.sshOptions).toEqual([
      '-p', '2222', '-t', '--', expect.stringContaining('cd -- "$HOME"/'),
    ]);
    expect(managers.terminalRuntime.registerSshObservers).toHaveBeenCalledWith('pty-1', 'lab', command);
  });

  it.each(['ssh ops@lab.example', 'ssh lab.example:2222', 'ssh -p 22 lab', 'ssh lab uptime'])(
    'leaves %s to the literal parser', (input) => {
      const { managers, tabs } = makeManagers(JSON.stringify({ lab: { destination: 'lab.example', port: 2222 } }));

      new SshManager(managers).run(input);

      expect(tabs.at(-1)?.harness?.hostName).toBeUndefined();
      expect(tabs.at(-1)?.harness?.sshOptions ?? []).not.toContain('--');
    },
  );

  it('falls back to a literal tab for an unmatched name', () => {
    const { managers, tabs } = makeManagers(JSON.stringify({ lab: { destination: 'lab.example' } }));

    new SshManager(managers).run('ssh ghost');

    expect(tabs.at(-1)?.label).toBe('ghost');
    expect(tabs.at(-1)?.harness?.hostName).toBeUndefined();
  });

  it('returns the missing-row error for a Hosts origin whose saved name has gone', () => {
    const { managers, tabs } = makeManagers(JSON.stringify({ other: { destination: 'other.example' } }));
    const hosts = makePluginTab('hosts', '#fff', 2, 1, '#fff', 'hosts', {
      id: 'hosts', instanceKey: 'hosts', schemaVersion: 1,
      payload: { filePath: '', rows: [] }, fileRefs: [], sourceLabel: 'janus',
    });
    tabs.push(hosts);

    expect(new SshManager(managers).run('ssh ghost', 'hosts')).toBe('No host named "ghost".');

    expect(tabs.at(-1)).toBe(hosts);
    expect(managers.pty.spawn).not.toHaveBeenCalled();
  });

  it('uses a usable home catalog after a malformed project file and reports the problem once', () => {
    const { managers, tabs, root } = makeManagers('{bad json', JSON.stringify({ lab: { destination: 'home.example' } }));
    const manager = new SshManager(managers);

    manager.run('ssh lab');
    manager.run('ssh lab');

    expect(tabs.at(-1)?.harness?.destination).toBe('home.example');
    expect(tabs.at(-1)?.harness?.hostName).toBe('lab');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      managers, 'manual', 'janus',
      `Hosts file ${path.join(root, '.janissary', 'hosts.json')} is unusable: hosts.json is not valid JSON.`,
    );
  });

  it('falls back to a literal tab when the effective file is unusable and reports it once', () => {
    const { managers, tabs } = makeManagers(undefined, '{bad json');
    const manager = new SshManager(managers);

    manager.run('ssh lab');
    manager.run('ssh lab');

    expect(tabs.at(-1)?.harness?.destination).toBe('lab');
    expect(tabs.at(-1)?.harness?.hostName).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('suffixes a second saved session with the saved spelling', () => {
    const { managers } = makeManagers(JSON.stringify({ lab: { destination: 'lab.example' } }));
    const manager = new SshManager(managers);

    manager.run('ssh lab');
    manager.run('ssh lab');

    expect(managers.terminalRuntime.registerSshObservers).toHaveBeenNthCalledWith(2, 'pty-1', 'lab-2', 'ssh -- lab.example');
  });

  it('uses the named execution tab as creator for group, color and cwd', () => {
    const { managers, tabs } = makeManagers(
      JSON.stringify({ lab: { destination: 'lab.example' } }), undefined, { group: 7, groupColor: 'blue' },
    );
    const other = makeTab('other', 'green', 2, [], [], undefined, 3, 'green');
    tabs.push(other);
    managers.tab.cur = () => other;

    new SshManager(managers).run('ssh lab', 'janus');

    expect(tabs.at(-1)?.group).toBe(7);
    expect(tabs.at(-1)?.groupColor).toBe('blue');
    expect(managers.tab.cwdOf).toHaveBeenCalledWith('janus');
    expect(vi.mocked(managers.pty.spawn).mock.calls[0][3]).toBe('/work');
  });
});
