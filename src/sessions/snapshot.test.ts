import { describe, expect, it } from 'vitest';
import { channelOf, recordOf, sshTabs } from './snapshot.js';
import type { RemoteEntry } from '../remote/attach.js';
import type { Managers } from '../managers.js';
import type { Tab } from '../tab/types.js';

// The live world read: `RemoteManager`'s channels and `TabManager`'s tabs turned into the plain
// snapshot `composeSessionRows` consumes. `rows.test.ts` covers the composition from a snapshot, so
// everything here is only exercised indirectly — and the parts below are the ones that decide what
// a session row says about a tab.

function tab(label: string, overrides: Partial<Tab> = {}): Tab {
  return { label, ...overrides } as unknown as Tab;
}

function navigator(label: string, root: string): Tab {
  return tab(label, { view: 'files', files: { root, absoluteRoot: root, rows: [] } as never });
}

function harnessTab(label: string, overrides: Partial<Tab> = {}): Tab {
  return tab(label, { view: 'harness', harness: { name: 'claude', program: 'claude', ptyId: 'p', status: 'running' }, ...overrides });
}

function sshTab(label: string, destination: string): Tab {
  return harnessTab(label, { harness: { name: 'ssh', program: 'ssh', ptyId: 'p', status: 'running', destination } as never });
}

function managers(tabs: Tab[]): Managers {
  return {
    tab: { tabs, byLabel: (label: string) => tabs.find((candidate) => candidate.label === label) },
  } as unknown as Managers;
}

const emptyManagers = managers([]);

function entry(overrides: Partial<RemoteEntry> = {}): RemoteEntry {
  return {
    channel: { sessionId: '11111111-2222-3333-4444-555555555555', spawnedProcesses: () => [] } as never,
    labels: new Set<string>(),
    workspaceLabel: 'claude',
    address: { host: 'devbox', destination: 'devbox', address: 'devbox:/srv/proj' } as never,
    workspaceDir: '/srv/proj/.janissary/workspace/claude',
    attach: { active: false },
    ...overrides,
  } as unknown as RemoteEntry;
}

const activity = () => 42;

describe('channelOf member rows', () => {
  it('uses a surviving harness label when it has no title and excludes legacy neutral tabs', () => {
    const channel = channelOf(managers([harnessTab('claude'), tab('old-agent')]), entry({ labels: new Set(['claude', 'old-agent']) }), activity);
    expect(channel.members).toEqual([{ label: 'claude', name: 'claude', kind: 'harness', activity: 42 }]);
  });
  // The third column says what the tab *is*, matching the tab it opens or would open — so a tree is
  // a navigator row, not an agent one.
  it('reads a file navigator as a navigator named for its root', () => {
    const tabs = [navigator('tree', '/srv/proj/src')];

    const channel = channelOf(managers(tabs), entry({ labels: new Set(['claude', 'tree']) }), activity);

    expect(channel.members).toContainEqual({ label: 'tree', name: 'files /srv/proj/src', kind: 'navigator', activity: 42 });
  });

  it('reads a harness tab as a harness named by its title', () => {
    const tabs = [harnessTab('claude', { title: 'reviewer' })];

    const channel = channelOf(managers(tabs), entry(), activity);

    expect(channel.members).toEqual([{ label: 'claude', name: 'reviewer', kind: 'harness', activity: 42 }]);
  });

  it('reads a remote shell plugin tab as a shell row', () => {
    const shell = tab('scratch', { plugin: { id: 'shell' } as never });

    expect(channelOf(managers([shell]), entry({ labels: new Set(['scratch']) }), activity).members[0])
      .toMatchObject({ label: 'scratch', kind: 'shell' });
  });

  // A joined tab can close while the channel lives on; its label stays in the entry's set, and a row
  // for a tab that is no longer there would be a row the user cannot act on.
  it('drops a label whose tab has since closed', () => {
    const channel = channelOf(managers([]), entry({ labels: new Set(['claude', 'gone']) }), activity);

    expect(channel.members).toEqual([]);
  });
});

describe('sshTabs', () => {
  it('lists each ssh tab with its host stripped of the user', () => {
    const tabs = [sshTab('prod', 'deploy@web1'), tab('claude')];

    expect(sshTabs(managers(tabs), activity)).toEqual([
      { label: 'prod', host: 'web1', destination: 'deploy@web1', activity: 42 },
    ]);
  });

  it('lists a destination with no user as its own host', () => {
    expect(sshTabs(managers([sshTab('box', 'web2')]), activity))
      .toEqual([{ label: 'box', host: 'web2', destination: 'web2', activity: 42 }]);
  });

  it('lists nothing when no tab is an ssh session', () => {
    expect(sshTabs(managers([harnessTab('claude'), navigator('tree', '/srv')]), activity)).toEqual([]);
  });
});

describe('recordOf process rows', () => {
  it('excludes legacy pipe processes while retaining live harnesses', () => {
    const record = recordOf(managers([harnessTab('claude')]), withProcesses([{ id: 'p1', mode: 'pty', harness: 'claude' }, { id: 'p2', mode: 'pipe', agentName: 'old-agent' }]), 7);
    expect(record?.launchKind).toBe('harness');
    expect(record?.processes).toEqual([{ id: 'p1', label: 'claude', kind: 'harness', harness: 'claude' }]);
  });

  it('uses a surviving process kind when it carries the launch label', () => {
    const shell = tab('claude', { plugin: { id: 'shell' } as never });
    expect(recordOf(managers([shell]), withProcesses([{ id: 'p2', mode: 'pty', harness: 'claude' }]), 7)?.launchKind).toBe('harness');
  });
  function withProcesses(states: unknown[]): RemoteEntry {
    return entry({ channel: { sessionId: 'session-1', spawnedProcesses: () => states } as never });
  }

  it('describes a harness process as the tab that launched the channel', () => {
    const record = recordOf(managers([harnessTab('claude')]), withProcesses([{ id: 'p1', mode: 'pty', harness: 'claude' }]), 7);

    expect(record?.processes).toEqual([{ id: 'p1', label: 'claude', kind: 'harness', harness: 'claude' }]);
    expect(record?.activity).toBe(7);
  });

  it('carries the auto-approve flag when the spawn frame carried one', () => {
    const record = recordOf(managers([harnessTab('claude')]), withProcesses([{ id: 'p1', mode: 'pty', harness: 'claude', autoApprove: true, autoResume: true }]), 7);

    expect(record?.processes[0]).toMatchObject({ autoApprove: true, autoResume: true });
  });

  it('records a shell nonce and offline mode with its live cwd from tab runtime', () => {
    const shell = tab('claude', {
      plugin: { id: 'shell' } as never,
      runtime: { busy: false, context: [], queue: [], cwd: '/remote/work/subdir' },
    });
    const record = recordOf(managers([shell]), withProcesses([{
      id: 'p4', mode: 'pty', agentName: 'claude', shell: { nonce: 'a'.repeat(32) },
      offline: true, cwd: '/remote/work',
    }]), 7);

    expect(record?.processes).toEqual([{
      id: 'p4', label: 'claude', kind: 'shell', shell: { nonce: 'a'.repeat(32) },
      offline: true, cwd: '/remote/work/subdir',
    }]);
    expect(record?.launchKind).toBe('shell');
  });

  it('keeps the restored shell as launch owner while retaining the workspace identity', () => {
    const shell = tab('claude', { plugin: { id: 'shell' } as never });
    const entryAfterAttach = withProcesses([{
      id: 'p5', mode: 'pty', agentName: 'claude', shell: { nonce: 'b'.repeat(32) }, offline: false,
      cwd: '/remote/work',
    }]);
    entryAfterAttach.workspaceLabel = 'claude-attach';
    entryAfterAttach.launchLabel = 'claude';

    const record = recordOf(managers([shell]), entryAfterAttach, 7);

    expect(record).toMatchObject({ workspaceLabel: 'claude-attach', launchLabel: 'claude', launchKind: 'shell' });
  });

  // A PTY takeover or an inline terminal card belongs to a tab already listed in the channel, so a
  // row of its own would double-count it.
  it('contributes no row for a process that is neither a harness nor an agent shell', () => {
    const record = recordOf(managers([harnessTab('claude')]), withProcesses([
      { id: 'p1', mode: 'pty', harness: 'claude' },
      { id: 'p3', mode: 'pty' },
    ]), 7);

    expect(record?.processes.map((process) => process.id)).toEqual(['p1']);
  });

  it('records nothing when the channel spawned nothing worth a row', () => {
    expect(recordOf(emptyManagers, withProcesses([{ id: 'p3', mode: 'pty' }]), 7)).toBeUndefined();
  });

  it('records nothing for a channel that has not settled a workspace yet', () => {
    expect(recordOf(emptyManagers, entry({ workspaceDir: undefined } as Partial<RemoteEntry>), 7)).toBeUndefined();
  });
});
