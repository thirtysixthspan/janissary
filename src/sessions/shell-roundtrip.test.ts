import { describe, expect, it, vi } from 'vitest';
import { restoreSessionTabs } from './restore-tabs.js';
import type { Managers } from '../managers.js';
import type { RemoteSessionRecord } from './store.js';

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
    const managers = {
      tab: { tabs: [], byLabel: (label: string) => restored.includes(label) ? { label } : undefined },
      plugins: { reattach: vi.fn(async (_id: string, data: unknown) => { calls.push(data); restored.push((data as { label: string }).label); }) },
      remote: { get: () => ({ discardUnclaimed: vi.fn() }) },
    } as unknown as Managers;
    const session = record();
    const processes = session.processes.map((entry) => ({
      id: entry.id, program: 'zsh', mode: 'pty' as const, agentName: entry.label,
      shell: entry.shell, offline: entry.offline, cwd: entry.cwd,
    }));

    await expect(restoreSessionTabs(managers, session, 'main-2', processes)).resolves.toEqual(['main', 'scratch']);
    expect(calls).toEqual([
      { label: 'main', nonce, cwd: '/remote/work/src', workspace: '/remote/work', offline: true, host: 'devbox', ptyId: 'rpty1' },
      { label: 'scratch', nonce, cwd: '/remote/work/docs', workspace: '/remote/work', offline: true, host: 'devbox', ptyId: 'rpty2' },
    ]);
  });
});
