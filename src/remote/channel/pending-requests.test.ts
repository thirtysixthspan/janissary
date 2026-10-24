import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingRequests } from './pending-requests.js';

describe('PendingRequests', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('resolves and rejects the request each settlement names', async () => {
    const pending = new PendingRequests<string>();
    const first = pending.open('a');
    const second = pending.open('b');
    expect(pending.settle('b', 'second')).toBe(true);
    expect(pending.fail('a', new Error('refused'))).toBe(true);
    await expect(first).rejects.toThrow('refused');
    await expect(second).resolves.toBe('second');
  });

  it('settles a request once, so a late answer and an unknown id are no-ops', async () => {
    const pending = new PendingRequests<string>();
    const request = pending.open('a');
    pending.settle('a', 'first');
    expect(pending.settle('a', 'late')).toBe(false);
    expect(pending.fail('a', new Error('late'))).toBe(false);
    expect(pending.settle('never-opened', 'x')).toBe(false);
    await expect(request).resolves.toBe('first');
  });

  it('calls the timeout handler once the deadline passes, and not for a request settled first', async () => {
    const pending = new PendingRequests<string>();
    const onTimeout = vi.fn((id: string) => { pending.fail(id, new Error('timed out')); });
    const slow = pending.open('slow', { deadlineMs: 1000, onTimeout });
    const quick = pending.open('quick', { deadlineMs: 1000, onTimeout });
    pending.settle('quick', 'done');
    const outcome = expect(slow).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
    await expect(quick).resolves.toBe('done');
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledWith('slow');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unrefs its deadline timer so a waiting request never holds the process open', () => {
    const unref = vi.fn();
    const timer = { unref } as unknown as ReturnType<typeof setTimeout>;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue(timer);
    void new PendingRequests<string>().open('a', { deadlineMs: 1000, onTimeout: () => {} });
    expect(unref).toHaveBeenCalledOnce();
    setTimeoutSpy.mockRestore();
  });

  it('settles every waiting request with its own outcome and leaves none behind', async () => {
    const pending = new PendingRequests<string>();
    const kept = pending.open('keep', { deadlineMs: 1000, onTimeout: () => {} });
    const refused = pending.open('refuse', { deadlineMs: 1000, onTimeout: () => {} });
    pending.settleAll((id) => (id === 'keep' ? { value: 'closed' } : { reason: new Error('gone') }));
    await expect(kept).resolves.toBe('closed');
    await expect(refused).rejects.toThrow('gone');
    expect(pending.settle('keep', 'again')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
