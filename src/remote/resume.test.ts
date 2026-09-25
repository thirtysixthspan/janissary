import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { detachRemoteEntry, terminateRemoteEntry, type RemoteEntry } from './attach.js';
import { answerSessionState, askSessionState, handleAttachResult, SESSION_STATE_TIMEOUT_MS, type ResumeState } from './resume.js';
import { RemoteManager } from './manager.js';

vi.mock('../notifications/index.js', () => ({ notify: vi.fn() }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));

// The query's three exits: the answer, the deadline, and the entry losing the ability to answer. The
// last two both resolve `undefined`, which is what tells an attach that nothing was established —
// deliberately different from the empty list, which is the peer saying its workspace is empty.

function entry(): RemoteEntry {
  return {
    channel: { sessionId: 'session-1', send: vi.fn(), finish: vi.fn(), close: vi.fn(), closeAfterShutdown: vi.fn(), disconnect: vi.fn() },
    address: { address: 'devbox', destination: 'devbox', host: 'devbox' },
    labels: new Set(['claude']),
    handlers: new Map(),
    workspaceLabel: 'claude',
    workspaceDir: '/remote/ws',
    closed: false,
    settled: true,
    attach: { stop: vi.fn(), accepted: vi.fn() },
  } as unknown as RemoteEntry;
}

const managers = {} as unknown as Managers;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('askSessionState', () => {
  it('resolves with what the peer answered', async () => {
    const target = entry();
    const query = askSessionState(target);
    answerSessionState(target, [{ id: 'rpty1', program: 'claude', mode: 'pty', harness: 'claude' }]);
    await expect(query).resolves.toHaveLength(1);
  });

  // An empty list is an answer, not an absence: it says the workspace is holding nothing.
  it('keeps an empty answer distinct from no answer', async () => {
    const target = entry();
    const query = askSessionState(target);
    answerSessionState(target, []);
    await expect(query).resolves.toEqual([]);
  });

  // The hang this exists to end. A peer that accepts and then never answers — a remote `janus`
  // upgraded while the session sat detached is the concrete case — used to leave this unresolved
  // for good, and with it the attach and its placeholder tab.
  it('gives up on a peer that never answers', async () => {
    const query = askSessionState(entry());
    vi.advanceTimersByTime(SESSION_STATE_TIMEOUT_MS);
    await expect(query).resolves.toBeUndefined();
  });

  it('keeps waiting until the deadline is actually reached', async () => {
    const settled = vi.fn();
    void askSessionState(entry()).then(settled);
    vi.advanceTimersByTime(SESSION_STATE_TIMEOUT_MS - 1);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
  });

  // Waiting out a 30-second deadline for an answer that can no longer arrive is pure delay, so an
  // entry that stops being able to answer releases its waiter at once.
  it('releases its waiter when the entry is terminated', async () => {
    const target = entry();
    const query = askSessionState(target);
    terminateRemoteEntry(managers, target, false);
    await expect(query).resolves.toBeUndefined();
  });

  it('releases its waiter when the entry is detached', async () => {
    const target = entry();
    const query = askSessionState(target);
    detachRemoteEntry(target);
    await expect(query).resolves.toBeUndefined();
  });

  // Closing the placeholder tab while an accepted attach waits for the peer's answer is the last
  // label letting the entry go. That is an ending like the other two, and it goes through the same
  // routine, so the waiter hears at once instead of at the deadline.
  it('releases its waiter when the last label releases the entry', async () => {
    const remote = new RemoteManager({
      pty: {
        spawnTransport: vi.fn(() => ({ id: 'ssh1', program: 'ssh', write: vi.fn(), resize: vi.fn(), kill: vi.fn() })),
        reassignTransports: vi.fn(),
      },
      tab: { findIndex: vi.fn(() => -1), closeTab: vi.fn(), tabs: [], byLabel: vi.fn() },
    } as unknown as Managers);
    remote.create('claude', { address: 'devbox', destination: 'devbox', host: 'devbox' }, '/local', {
      onReady: vi.fn(), onFailed: vi.fn(), onClosed: vi.fn(),
    });
    const query = askSessionState(remote.liveEntries()[0]);
    remote.release('claude');
    await expect(query).resolves.toBeUndefined();
    remote.dispose();
  });

  // The deadline must not outlive the answer it was guarding, or it would fire against whatever
  // query came next on the same entry.
  it('does not fire its deadline after an answer arrived', async () => {
    const target = entry();
    const query = askSessionState(target);
    answerSessionState(target, []);
    await expect(query).resolves.toEqual([]);
    vi.advanceTimersByTime(SESSION_STATE_TIMEOUT_MS * 2);
    expect(target.sessionState).toBeUndefined();
  });
});

describe('detachRemoteEntry', () => {
  it('disconnects the channel instead of sending process-control frames', () => {
    const target = entry();
    detachRemoteEntry(target);
    expect(target.channel.disconnect).toHaveBeenCalledOnce();
    expect(target.channel.send).not.toHaveBeenCalled();
  });
});

// The remote-session-ended announcement is how the feed reports a session that ended on its own.
// An attach pressed from the sessions tab has its own narrator, so announcing here as well would
// land two differently worded endings for one event.
describe('handleAttachResult — who narrates a refusal', () => {
  beforeEach(() => { notify.mockClear(); });

  const narrating = {
    tab: { byLabel: () => ({ label: 'claude', log: [], sessionTerminated: undefined }) },
  } as unknown as Managers;

  function refusedAttach(resuming: boolean): void {
    const target = entry();
    const state: ResumeState = { resuming };
    const resume = resuming
      ? { session: 'session-1', workspaceDir: '/remote/ws', onResult: vi.fn() }
      : undefined;
    handleAttachResult(narrating, target,
      { type: 'attach-result', accepted: false }, 'creator', resume, state, vi.fn());
  }

  it('names the session once for an attach pressed from a record, and not in the generic line', () => {
    refusedAttach(true);
    expect(notify).not.toHaveBeenCalled();
  });

  // An automatic reconnect's refusal is a session that ended on its own, and nobody else
  // narrates it — the generic announcement stands as it always read.
  it('keeps the generic announcement for a refusal on the automatic reconnect path', () => {
    refusedAttach(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe('remote-session-terminated');
  });
});
