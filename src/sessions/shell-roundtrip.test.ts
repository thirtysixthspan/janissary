import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { restoreSessionTabs } from './restore-tabs.js';
import { startSessionAttach } from './attach.js';
import { startSshBridge } from './ssh-bridge.js';
import { askSessionState, type RemoteResume } from '../remote/resume.js';
import { remoteServeCommand } from '../remote/entry-factory.js';
import type { RemoteAddress } from '../remote/address.js';
import type { Managers } from '../managers.js';
import { initRemoteSessionStore, loadRemoteSessions, saveRemoteSessions, type RemoteSessionRecord } from './store.js';

vi.mock('../remote/resume.js', () => ({ askSessionState: vi.fn() }));
vi.mock('./ssh-bridge.js', () => ({ startSshBridge: vi.fn() }));

const nonce = 'a'.repeat(32);

function record(): RemoteSessionRecord {
  const shell = (id: string, label: string, cwd: string) => ({
    id, label, kind: 'shell' as const, shell: { nonce }, offline: true, cwd,
  });
  return {
    session: '11111111-2222-3333-4444-555555555555', address: 'devbox', destination: 'devbox',
    host: 'devbox', workspaceLabel: 'main', workspaceDir: '/remote/work', launchLabel: 'main',
    launchKind: 'shell', processes: [shell('rpty1', 'main', '/remote/work/src'), shell('rpty2', 'scratch', '/remote/work/docs')],
    activity: Date.now(),
  };
}

describe('remote shell session restoration', () => {
  it('reattaches every recorded shell with its PTY, cwd, workspace, nonce, and offline mode', async () => {
    const restored: string[] = [];
    const calls: unknown[] = [];
    const tabs = [{ label: 'scratch' }];
    const managers = {
      tab: { tabs, byLabel: (label: string) => restored.includes(label) || tabs.some((tab) => tab.label === label) ? { label } : undefined },
      plugins: { reattach: vi.fn(async (_id: string, data: unknown) => {
        calls.push(data);
        const label = (data as { label: string }).label;
        restored.push(label);
        tabs.push({ label });
      }) },
      remote: { get: () => ({ discardUnclaimed: vi.fn() }) },
    } as unknown as Managers;
    const session = record();
    const processes = session.processes.map((entry) => ({
      id: entry.id, program: 'zsh', mode: 'pty' as const, agentName: entry.label,
      shell: entry.shell, offline: entry.offline, cwd: entry.cwd,
    }));

    await expect(restoreSessionTabs(managers, session, 'main-2', processes)).resolves.toEqual(['main', 'scratch-2']);
    expect(calls).toEqual([
      { label: 'main', nonce, cwd: '/remote/work/src', workspace: '/remote/work', offline: true, host: 'devbox', ptyId: 'rpty1' },
      { label: 'scratch-2', nonce, cwd: '/remote/work/docs', workspace: '/remote/work', offline: true, host: 'devbox', ptyId: 'rpty2' },
    ]);
    expect(new Set(tabs.map((tab) => tab.label)).size).toBe(tabs.length);
  });
});

describe('park and attach of a saved-host shell', () => {
  it('reuses the recorded port and saved name after the scratch hosts file changes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-park-'));
    const hostsFile = path.join(root, '.janissary', 'hosts.json');
    mkdirSync(path.dirname(hostsFile), { recursive: true });
    writeFileSync(hostsFile, JSON.stringify({ lab: { destination: 'devbox:2222' } }));

    // The launch resolved a saved host into a plain address token plus a port and a name kept on the
    // record, so the address token alone still parses without consulting the catalog.
    const resolved: RemoteAddress = {
      address: 'devbox', destination: 'devbox', host: 'devbox', port: 2222, hostName: 'lab',
    };
    const parked = { ...record(), address: resolved.address, port: resolved.port, hostName: resolved.hostName };
    initRemoteSessionStore(root);
    saveRemoteSessions([parked]);
    const [reloaded] = loadRemoteSessions();
    expect(reloaded).toMatchObject({ port: 2222, hostName: 'lab' });

    writeFileSync(hostsFile, JSON.stringify({ lab: { destination: 'devbox:3333' } }));

    const tabs: { label: string }[] = [];
    const entry = { labels: new Set(['main']), channel: { discardUnclaimed: vi.fn() } };
    const managers = {
      harness: { attachRemote: vi.fn() },
      remote: {
        liveEntries: () => [entry], close: vi.fn(),
        entryOf: (label: string) => (entry.labels.has(label) ? entry : undefined),
        entryForSession: vi.fn(),
        promoteLaunchLabel: vi.fn(),
      },
      tab: {
        tabs, cur: () => ({ label: 'janus', group: 1, groupColor: '#111' }),
        findIndex: (label: string) => tabs.findIndex((tab) => tab.label === label),
        closeTab: (index: number) => { tabs.splice(index, 1); },
      },
    } as unknown as Managers;

    vi.mocked(askSessionState).mockResolvedValue([]);
    let resumed: RemoteAddress | undefined;
    vi.mocked(startSshBridge).mockImplementation(
      (_managers, launch: { address: RemoteAddress; resume: RemoteResume }) => {
        resumed = launch.address;
        launch.resume.onResult(true);
      },
    );

    await startSessionAttach(managers, reloaded);

    expect(resumed).toMatchObject({ destination: 'devbox', port: 2222, hostName: 'lab' });
    expect(remoteServeCommand(resumed!)).toBe(`ssh -p 2222 -t -- devbox '$SHELL -ic "janus remote-serve"'`);
  });
});
