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

  it('falls back to a tab\'s label when it has no title', () => {
    const channel = channelOf(managers([tab('claude')]), entry(), activity);

    expect(channel.members[0]).toMatchObject({ name: 'claude', kind: 'agent' });
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

  // A joined agent tab's shell already carries that tab's label as its agent name, so it is listed
  // against the tab it belongs to rather than against the channel that spawned it.
  it('describes a pipe process as the agent tab that owns it', () => {
    const record = recordOf(emptyManagers, withProcesses([{ id: 'p2', mode: 'pipe', agentName: 'claude-2' }]), 7);

    expect(record?.processes).toEqual([{ id: 'p2', label: 'claude-2', kind: 'agent' }]);
  });

  // Nothing in that list carries the launching tab's own label, so the record falls back to saying a
  // harness opened the channel — which is what a channel that only ever ran a remote harness is.
  it('uses the launching plugin kind when no process carries the launch label', () => {
    const shell = tab('claude', { plugin: { id: 'shell' } as never });
    const record = recordOf(managers([shell]), withProcesses([{ id: 'p2', mode: 'pipe', agentName: 'claude-2' }]), 7);

    expect(record?.launchKind).toBe('shell');
  });

  it('reads the launch kind off the process that carries the launch label', () => {
    const record = recordOf(managers([harnessTab('claude')]), withProcesses([
      { id: 'p1', mode: 'pty', harness: 'claude' },
      { id: 'p2', mode: 'pipe', agentName: 'claude-2' },
    ]), 7);

    expect(record?.launchKind).toBe('harness');
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
