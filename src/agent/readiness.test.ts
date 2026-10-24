import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitReady } from './readiness.js';

describe('awaitReady', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('answers what the awaited promise resolves to, and leaves no timer behind', async () => {
    const signal = new AbortController().signal;
    await expect(awaitReady(Promise.resolve('/srv/ws'), signal, 15_000, 'timed out')).resolves.toBe('/srv/ws');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the timeout message once the deadline passes', async () => {
    const waiting = awaitReady(new Promise<string>(() => {}), new AbortController().signal, 15_000, 'Agent: readiness timed out.');
    const outcome = expect(waiting).rejects.toThrow('Agent: readiness timed out.');
    await vi.advanceTimersByTimeAsync(15_000);
    await outcome;
  });

  it('rejects as terminated when the run is aborted while waiting, and stops listening', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const waiting = awaitReady(new Promise<string>(() => {}), controller.signal, 15_000, 'timed out');
    controller.abort();
    await expect(waiting).rejects.toThrow('Agent terminated.');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects at once for a run already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(awaitReady(Promise.resolve('ready'), controller.signal, 15_000, 'timed out'))
      .rejects.toThrow('Agent terminated.');
  });
});
