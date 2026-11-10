import { describe, expect, it } from 'vitest';
import { deferred } from './deferred.js';

describe('deferred', () => {
  it('resolves the promise with the value handed to resolve', async () => {
    const pending = deferred<number>();
    pending.resolve(7);
    await expect(pending.promise).resolves.toBe(7);
  });

  it('rejects the promise with the reason handed to reject', async () => {
    const pending = deferred<number>();
    pending.reject(new Error('refused'));
    await expect(pending.promise).rejects.toThrow('refused');
  });

  it('keeps the first settlement when settled twice', async () => {
    const resolvedFirst = deferred<string>();
    resolvedFirst.resolve('first');
    resolvedFirst.reject(new Error('late'));
    await expect(resolvedFirst.promise).resolves.toBe('first');

    const rejectedFirst = deferred<string>();
    rejectedFirst.reject(new Error('first'));
    rejectedFirst.resolve('late');
    await expect(rejectedFirst.promise).rejects.toThrow('first');
  });

  it('settles when the functions are destructured', async () => {
    const { promise, resolve } = deferred<void>();
    resolve();
    await expect(promise).resolves.toBeUndefined();
  });
});
