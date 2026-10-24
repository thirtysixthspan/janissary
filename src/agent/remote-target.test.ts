import { describe, it, expect, vi } from 'vitest';
import { resolveRemoteAgentTarget } from './remote-target.js';
import type { Managers } from '../managers.js';

// Which live session an agent run on `user@devbox` rides instead of opening its own: one on the same
// destination whose channel is attached, whose workspace has landed, and which has not ended. Anything
// else gets a fresh channel of its own.

type FakeEntry = {
  labels: Set<string>;
  address: { destination: string; host: string };
  channel: { attached: boolean };
  workspaceDir?: string;
  closed: boolean;
};

function liveEntry(overrides: Partial<FakeEntry> = {}): FakeEntry {
  return {
    labels: new Set(['h1']),
    address: { destination: 'user@devbox', host: 'devbox' },
    channel: { attached: true },
    workspaceDir: '/srv/ws',
    closed: false,
    ...overrides,
  };
}

function managersWith(entry: FakeEntry) {
  const fresh = { attached: true };
  const remote = {
    liveEntries: () => [entry],
    addressOf: (label: string) => (entry.labels.has(label) ? entry.address : undefined),
    get: (label: string) => (entry.labels.has(label) ? entry.channel : undefined),
    workspaceOf: (label: string) => (entry.labels.has(label) ? entry.workspaceDir : undefined),
    acquireAgentLease: vi.fn(() => async () => {}),
    create: vi.fn(() => fresh),
    readyOf: vi.fn(() => Promise.resolve('/srv/fresh')),
    release: vi.fn(),
  };
  return { managers: { remote } as unknown as Managers, remote };
}

const resolve = (managers: Managers) =>
  resolveRemoteAgentTarget(managers, 'USER@devbox', 'shell', '/project', new AbortController().signal);

describe('resolveRemoteAgentTarget reuse of a live session', () => {
  it('rides an attached session with a workspace on the same destination, ignoring case', async () => {
    const { managers, remote } = managersWith(liveEntry());
    const target = await resolve(managers);
    expect(remote.create).not.toHaveBeenCalled();
    expect(target.workspace).toBe('/srv/ws');
    expect(remote.acquireAgentLease).toHaveBeenCalledWith('h1', expect.stringMatching(/^agent:/));
  });

  it.each([
    { state: 'detached', entry: liveEntry({ channel: { attached: false } }) },
    { state: 'without a workspace yet', entry: liveEntry({ workspaceDir: undefined }) },
    { state: 'on another destination', entry: liveEntry({ address: { destination: 'user@other', host: 'other' } }) },
    { state: 'already ended', entry: liveEntry({ closed: true }) },
  ])('opens its own channel instead of riding a session $state', async ({ entry }) => {
    const { managers, remote } = managersWith(entry);
    const target = await resolve(managers);
    expect(remote.create).toHaveBeenCalledTimes(1);
    expect(target.workspace).toBe('/srv/fresh');
  });
});
