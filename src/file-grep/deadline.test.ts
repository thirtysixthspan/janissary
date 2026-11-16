import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { DeadlineResult } from './deadline.js';
import { withDeadline } from './deadline.js';
import type { GrepEnding } from './format.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withDeadline', () => {
  it('returns timeout for an already expired deadline without invoking the operation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const operation = vi.fn(async () => 'value');
    await expect(withDeadline(999, operation)).resolves.toEqual({ kind: 'timeout' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('returns timeout for a deadline equal to the current time without invoking the operation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const operation = vi.fn(async () => 'value');
    await expect(withDeadline(1000, operation)).resolves.toEqual({ kind: 'timeout' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('preserves completed values including null and undefined', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const values: Array<string | null | undefined> = ['value', null, undefined];
    for (const value of values) {
      await expect(withDeadline(2000, async () => value)).resolves.toEqual({ kind: 'completed', value });
    }
    const object = { id: 1 };
    const result = await withDeadline(2000, async () => object);
    expect(result.kind).toBe('completed');
    if (result.kind === 'completed') expect(result.value).toBe(object);
  });

  it('rejects with an operation rejection unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const failure = new Error('operation failed');
    await expect(withDeadline(2000, async () => {
      throw failure;
    })).rejects.toBe(failure);
  });

  it('rejects with a synchronous thunk throw unchanged', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const failure = new Error('thunk threw');
    const operation = (): Promise<never> => {
      throw failure;
    };
    await expect(withDeadline(2000, operation)).rejects.toBe(failure);
  });

  it('clears its timer after completion, rejection and timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    await withDeadline(2000, async () => 'value');
    expect(vi.getTimerCount()).toBe(0);
    await expect(withDeadline(2000, async () => {
      throw new Error('operation failed');
    })).rejects.toThrow('operation failed');
    expect(vi.getTimerCount()).toBe(0);
    const pending = Promise.withResolvers<string>();
    const result = withDeadline(1500, async () => pending.promise);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toEqual({ kind: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out while an operation remains pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<string>();
    const result = withDeadline(1100, async () => pending.promise);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ kind: 'timeout' });
  });

  it('ignores a late resolution after timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<string>();
    const result = withDeadline(1100, async () => pending.promise);
    await vi.advanceTimersByTimeAsync(100);
    pending.resolve('late value');
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ kind: 'timeout' });
  });

  it('observes a late rejection after timeout without an unhandled rejection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const pending = Promise.withResolvers<string>();
      const result = withDeadline(1100, async () => pending.promise);
      await vi.advanceTimersByTimeAsync(100);
      pending.reject(new Error('late failure'));
      await vi.advanceTimersByTimeAsync(0);
      await expect(result).resolves.toEqual({ kind: 'timeout' });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('keeps a completion that wins just before the timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<string>();
    const result = withDeadline(1100, async () => pending.promise);
    pending.resolve('just in time');
    await vi.advanceTimersByTimeAsync(99);
    await expect(result).resolves.toEqual({ kind: 'completed', value: 'just in time' });
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ kind: 'completed', value: 'just in time' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a timeout that wins before a later completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const pending = Promise.withResolvers<string>();
    const result = withDeadline(1100, async () => pending.promise);
    await vi.advanceTimersByTimeAsync(100);
    pending.resolve('too late');
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toEqual({ kind: 'timeout' });
  });

  it('keeps its timeout result distinct from the formatter ending type', () => {
    const timeout: DeadlineResult<number> = { kind: 'timeout' };
    expect(timeout).toEqual({ kind: 'timeout' });
    expect('value' in timeout).toBe(false);
    expectTypeOf<DeadlineResult<number>>().not.toMatchTypeOf<GrepEnding>();
  });
});
