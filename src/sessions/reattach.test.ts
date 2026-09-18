import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import type { RemoteResume } from '../remote/resume.js';
import { askSessionState } from '../remote/resume.js';
import { startRemoteAgent } from '../profile/remote-agent.js';
import { startSessionReattach } from './reattach.js';
import { restoreSessionTabs } from './restore-tabs.js';
import type { RemoteSessionRecord } from './store.js';

// What this suite is about is how an accepted reattach settles — the peer's answer, an empty answer,
// and no answer at all read differently on purpose, and the last of them used to not settle at all.
// The connection itself is faked: `reattachRemote` hands back whichever answer the case is about,
// and the agent launch hands its resume straight back too.
vi.mock('../remote/resume.js', () => ({ askSessionState: vi.fn() }));
vi.mock('./restore-tabs.js', () => ({ restoreSessionTabs: vi.fn(() => []) }));
vi.mock('../profile/remote-agent.js', () => ({ startRemoteAgent: vi.fn() }));

const SESSION = '11111111-2222-3333-4444-555555555555';

function record(): RemoteSessionRecord {
  return {
    session: SESSION,
    address: 'devbox',
    destination: 'devbox',
    host: 'devbox',
    workspaceLabel: 'claude',
    workspaceDir: '/srv/proj/.janissary/workspace/claude',
    launchLabel: 'claude',
    launchKind: 'harness',
    processes: [{ id: 'rpty1', label: 'claude', kind: 'harness', harness: 'claude' }],
    activity: Date.now(),
  };
}

// The launch accepts, which is the state every case here starts from: the peer is there, the tab
// exists, and what is left is the query about what survived.
function harness() {
  const entry = { labels: new Set(['claude']), channel: { discardUnclaimed: vi.fn() } };
  const managers = {
    harness: {
      reattachRemote: vi.fn((options: { resume: { onResult: (accepted: boolean) => void } }) => {
        options.resume.onResult(true);
      }),
    },
    remote: { liveEntries: () => [entry], close: vi.fn() },
    shell: { adoptRemoteShell: vi.fn(), releaseAdoptedShell: vi.fn() },
    tab: { tabs: [], cur: () => ({ label: 'janus', group: 1, groupColor: '#111' }) },
  } as unknown as Managers;
  return { managers };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('startSessionReattach', () => {
  it('reattaches when the peer says what is running', async () => {
    const h = harness();
    vi.mocked(askSessionState).mockResolvedValue([
      { id: 'rpty1', program: 'claude', mode: 'pty', harness: 'claude' },
    ]);

    await expect(startSessionReattach(h.managers, record())).resolves.toMatchObject({ kind: 'reattached' });
    expect(restoreSessionTabs).toHaveBeenCalledOnce();
  });

  // An empty list is the peer answering that its workspace holds nothing, which establishes that the
  // session is over. Distinct from no answer, which establishes nothing.
  it('ends the session when the peer answers that nothing is running', async () => {
    const h = harness();
    vi.mocked(askSessionState).mockResolvedValue([]);

    await expect(startSessionReattach(h.managers, record())).resolves.toMatchObject({ kind: 'ended' });
  });

  // The hang. A peer can accept and then never answer — most concretely when a remote `janus` was
  // upgraded while the session sat detached, since the handshake is written by the relaying process
  // rather than by the parked peer behind it. Without an exit, the promise never settled, the
  // placeholder tab stayed open, and every press of the row's button left another one behind.
  it('fails rather than hanging when the peer never answers', async () => {
    const h = harness();
    vi.mocked(askSessionState).mockResolvedValue(undefined);

    await expect(startSessionReattach(h.managers, record())).resolves.toMatchObject({
      kind: 'failed',
      reason: 'devbox accepted the reattach but never said what was running.',
    });
    expect(restoreSessionTabs).not.toHaveBeenCalled();
  });

  // The record has to survive a failure, which is what keeps the row parked with its button rather
  // than marking it ended — the same contract an unreachable host gets.
  it('does not restore any tab for an unanswered query', async () => {
    const h = harness();
    vi.mocked(askSessionState).mockResolvedValue(undefined);

    const outcome = await startSessionReattach(h.managers, record());
    expect(outcome.kind).toBe('failed');
    expect(h.managers.shell.adoptRemoteShell).not.toHaveBeenCalled();
  });

  // The agent branch parks the recorded spawn id before the tab exists, so a reattach that does not
  // come back must release it: the label is about to be freed, and a later tab granted the same
  // label must bind its own shell, not a process id from a session that ended.
  it('releases the adopted shell when an agent reattach ends instead of reattaching', async () => {
    const h = harness();
    vi.mocked(askSessionState).mockResolvedValue(undefined);
    vi.mocked(startRemoteAgent).mockImplementation(
      (_managers, launch: { resume: RemoteResume }) => { launch.resume.onResult(true); },
    );
    vi.mocked(askSessionState).mockResolvedValue(undefined);

    const agentRecord: RemoteSessionRecord = {
      ...record(),
      launchKind: 'agent',
      processes: [{ id: 'rsh1', label: 'claude', kind: 'agent' }],
    };
    await startSessionReattach(h.managers, agentRecord);
    expect(h.managers.shell.adoptRemoteShell).toHaveBeenCalledWith('claude', 'rsh1', SESSION);
    expect(h.managers.shell.releaseAdoptedShell).toHaveBeenCalledWith('claude');
  });
});
