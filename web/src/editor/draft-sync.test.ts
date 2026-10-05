import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftSync } from './draft-sync';

function deferred() {
  let resolve!: (accepted: boolean) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<boolean>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function setup() {
  const send = vi.fn().mockResolvedValue(true);
  const sync = new DraftSync();
  sync.attach(send, true);
  sync.update('initial');
  return { sync, send };
}

describe('DraftSync', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('coalesces edits while awaiting acknowledgement and sends the latest afterward', async () => {
    const { sync, send } = setup();
    const pending = deferred();
    send.mockImplementationOnce(() => pending.promise);
    sync.update('first');
    await vi.advanceTimersByTimeAsync(500);
    sync.update('second');
    sync.update('latest');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls).toEqual([['first']]);
    pending.resolve(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(send.mock.calls).toEqual([['first'], ['latest']]);
    sync.update('latest');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('resends a failed snapshot after reconnection without another edit', async () => {
    const { sync, send } = setup();
    send.mockResolvedValueOnce(false);
    sync.update('draft');
    await vi.advanceTimersByTimeAsync(500);
    sync.setConnected(false);
    sync.setConnected(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls).toEqual([['draft'], ['draft']]);
  });

  it('retries a snapshot rejected while the initial socket was still opening', async () => {
    const { sync, send } = setup();
    send.mockResolvedValueOnce(false);
    sync.update('draft');
    await vi.advanceTimersByTimeAsync(500);
    sync.setConnected(true);
    expect(send.mock.calls).toEqual([['draft'], ['draft']]);
  });

  it('ignores old acknowledgements after reconnecting while a new write is pending', async () => {
    const { sync, send } = setup();
    const old = deferred();
    const current = deferred();
    send.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => current.promise);
    sync.update('old draft');
    await vi.advanceTimersByTimeAsync(500);
    sync.setConnected(false);
    sync.update('reconnected draft');
    sync.setConnected(true);
    sync.update('latest');
    old.resolve(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls).toEqual([['old draft'], ['reconnected draft']]);
    current.resolve(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(send).toHaveBeenLastCalledWith('latest');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('invalidates the old transport when a replacement attaches', async () => {
    const { sync, send } = setup();
    const old = deferred();
    send.mockImplementationOnce(() => old.promise);
    sync.update('draft');
    await vi.advanceTimersByTimeAsync(500);
    const replacement = vi.fn().mockResolvedValue(true);
    sync.detach();
    sync.update('new target draft');
    sync.attach(replacement, true);
    old.resolve(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls).toEqual([['draft']]);
    expect(replacement.mock.calls).toEqual([['new target draft']]);
  });

  it('detaches pending acknowledgements, timers, and future connection events', async () => {
    const { sync, send } = setup();
    const pending = deferred();
    send.mockImplementationOnce(() => pending.promise);
    sync.update('first');
    await vi.advanceTimersByTimeAsync(500);
    sync.update('queued');
    sync.detach();
    pending.resolve(true);
    sync.setConnected(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(send.mock.calls).toEqual([['first']]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers from a rejected send without treating it as acknowledged', async () => {
    const { sync, send } = setup();
    send.mockRejectedValueOnce(new Error('send failed'));
    sync.update('draft');
    await vi.advanceTimersByTimeAsync(500);
    sync.setConnected(false);
    sync.setConnected(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls).toEqual([['draft'], ['draft']]);
  });
});
