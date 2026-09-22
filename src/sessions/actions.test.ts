import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { runSessionAction, type SessionActionResult } from './actions.js';
import { terminateParkedSession } from './terminate-session.js';
import type { RemoteSessionRecord } from './store.js';

vi.mock('./terminate-session.js', async (importOriginal) => ({
  ...await importOriginal(),
  terminateParkedSession: vi.fn(),
}));
vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));

const SESSION = '11111111-2222-3333-4444-555555555555';

function record(): RemoteSessionRecord {
  return {
    session: SESSION, address: 'devbox', destination: 'devbox', host: 'devbox',
    workspaceLabel: 'claude', workspaceDir: '/srv/proj/.janissary/workspace/claude',
    launchLabel: 'claude', launchKind: 'harness', processes: [], activity: Date.now(),
  } as unknown as RemoteSessionRecord;
}

function managers(): Managers {
  return {
    remote: { liveEntries: () => [] },
    tab: { tabs: [], cur: () => ({ label: 'janus' }) },
  } as unknown as Managers;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('runSessionAction terminate', () => {
  it('raises the terminating marker synchronously before the attempt settles', () => {
    vi.mocked(terminateParkedSession).mockReturnValue(new Promise(() => {}));
    const result = runSessionAction(managers(), { recordFor: () => record() }, { kind: 'terminate', session: SESSION }, vi.fn());
    expect(result).toEqual({ ran: true, terminating: SESSION });
  });

  it('clears the marker and drops the record when the attempt resolves terminated', async () => {
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: true });
    const apply = vi.fn();
    runSessionAction(managers(), { recordFor: () => record() }, { kind: 'terminate', session: SESSION }, apply);

    await vi.waitFor(() => expect(apply).toHaveBeenCalled());

    expect(apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      ran: true, drop: SESSION, clearFailure: SESSION, terminatingDone: SESSION,
    }));
    expect(notify).toHaveBeenCalledOnce();
  });

  it('clears the marker and reports a failure when the attempt resolves not terminated', async () => {
    vi.mocked(terminateParkedSession).mockResolvedValue({ terminated: false, reason: 'devbox: timed out' });
    const apply = vi.fn();
    runSessionAction(managers(), { recordFor: () => record() }, { kind: 'terminate', session: SESSION }, apply);

    await vi.waitFor(() => expect(apply).toHaveBeenCalled());

    expect(apply).toHaveBeenCalledExactlyOnceWith({
      ran: true, terminatingDone: SESSION, failure: { session: SESSION, reason: 'devbox: timed out' },
    } satisfies SessionActionResult);
  });

  // The booked bug: a rejection from `terminateParkedSession` — reachable when opening the far-side
  // channel throws synchronously — left the row's `terminating` marker set for the life of the
  // process, with no attach control, no terminate control, and no failure line.
  it('clears the marker and reports a failure when the attempt rejects', async () => {
    vi.mocked(terminateParkedSession).mockRejectedValue(new Error('spawn ENOENT'));
    const apply = vi.fn();
    runSessionAction(managers(), { recordFor: () => record() }, { kind: 'terminate', session: SESSION }, apply);

    await vi.waitFor(() => expect(apply).toHaveBeenCalled());

    expect(apply).toHaveBeenCalledExactlyOnceWith({
      ran: true, terminatingDone: SESSION, failure: { session: SESSION, reason: 'spawn ENOENT' },
    } satisfies SessionActionResult);
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      expect.anything(), 'remote-session', 'janus',
      expect.stringContaining('could not be terminated: spawn ENOENT'),
    );
  });
});
