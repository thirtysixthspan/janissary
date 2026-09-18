import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { detachRemoteEntry, terminateRemoteEntry, type RemoteEntry } from './reattach.js';
import { answerSessionState, askSessionState, SESSION_STATE_TIMEOUT_MS } from './resume.js';

vi.mock('../notifications.js', () => ({ notify: vi.fn() }));
vi.mock('../file-navigator/remote-file-cache.js', () => ({ clearRemoteFileCacheForWorkspace: vi.fn() }));

// The query's three exits: the answer, the deadline, and the entry losing the ability to answer. The
// last two both resolve `undefined`, which is what tells a reattach that nothing was established —
// deliberately different from the empty list, which is the peer saying its workspace is empty.

function entry(): RemoteEntry {
  return {
    channel: { sessionId: 'session-1', send: vi.fn(), finish: vi.fn(), close: vi.fn() },
    address: { address: 'devbox', destination: 'devbox', host: 'devbox' },
    labels: new Set(['claude']),
    handlers: new Map(),
    workspaceLabel: 'claude',
    workspaceDir: '/remote/ws',
    closed: false,
    settled: true,
    reconnect: { stop: vi.fn(), accepted: vi.fn() },
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
  // for good, and with it the reattach and its placeholder tab.
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
