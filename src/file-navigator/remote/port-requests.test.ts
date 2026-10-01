import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from '../../remote/protocol-frames.js';
import {
  ENDED_REASON, LONG_REQUEST_DEADLINE_MS, REQUEST_DEADLINE_MS, RemotePortRequests, TIMED_OUT_REASON, requestDeadline,
} from './port-requests.js';

function track(
  requests: RemotePortRequests, request: string, operation: RemoteFilesystemOperation, args: RemoteFilesystemArguments = {},
) {
  const resolve = vi.fn();
  const reject = vi.fn();
  requests.add(request, { operation, args, resolve, reject });
  return { resolve, reject };
}

// A reply can be lost without the channel closing — the transport dies mid-request and the session
// comes back, or the detached peer evicts the reply from its bounded replay buffer — so a deadline
// is the only thing that ever settles such a request.
describe('RemotePortRequests deadlines', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rejects an unanswered read-only request once its deadline passes', () => {
    const requests = new RemotePortRequests();
    const { resolve, reject } = track(requests, 'r1', 'read-directory', { path: 'src' });

    vi.advanceTimersByTime(REQUEST_DEADLINE_MS - 1);
    expect(reject).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(reject).toHaveBeenCalledWith(new Error(TIMED_OUT_REASON));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('answers an unanswered mutating request with its failure value once its deadline passes', () => {
    const requests = new RemotePortRequests();
    const { resolve, reject } = track(requests, 'r1', 'rename', { path: 'a.txt', name: 'b.txt' });

    vi.advanceTimersByTime(REQUEST_DEADLINE_MS);

    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: TIMED_OUT_REASON }));
    expect(reject).not.toHaveBeenCalled();
  });

  it('gives work the far side really does, like a pull, the long deadline', () => {
    expect(requestDeadline('git-pull')).toBe(LONG_REQUEST_DEADLINE_MS);
    expect(requestDeadline('read-directory')).toBe(REQUEST_DEADLINE_MS);
    const requests = new RemotePortRequests();
    const { reject } = track(requests, 'r1', 'git-pull');

    vi.advanceTimersByTime(REQUEST_DEADLINE_MS);
    expect(reject).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LONG_REQUEST_DEADLINE_MS - REQUEST_DEADLINE_MS);

    expect(reject).toHaveBeenCalledWith(new Error(TIMED_OUT_REASON));
  });

  it('settles a request answered in time exactly once, with its reply', () => {
    const requests = new RemotePortRequests();
    const { resolve, reject } = track(requests, 'r1', 'read-directory', { path: 'src' });

    requests.answer('r1', ['entry'], undefined);
    vi.advanceTimersByTime(LONG_REQUEST_DEADLINE_MS);

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(['entry']);
    expect(reject).not.toHaveBeenCalled();
  });

  // The peer replays what it queued once the session reattaches, so a reply can still arrive late.
  it('drops a reply that arrives after its request timed out', () => {
    const requests = new RemotePortRequests();
    const { resolve, reject } = track(requests, 'r1', 'read-directory', { path: 'src' });
    vi.advanceTimersByTime(REQUEST_DEADLINE_MS);

    requests.answer('r1', ['late'], undefined);

    expect(reject).toHaveBeenCalledOnce();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not time out a request a close already settled', () => {
    const requests = new RemotePortRequests();
    const { reject } = track(requests, 'r1', 'read-directory', { path: 'src' });

    requests.failAll(ENDED_REASON);
    vi.advanceTimersByTime(LONG_REQUEST_DEADLINE_MS);

    expect(reject).toHaveBeenCalledOnce();
    expect(reject).toHaveBeenCalledWith(new Error(ENDED_REASON));
  });
});
