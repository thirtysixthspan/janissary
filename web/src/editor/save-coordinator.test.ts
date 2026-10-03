import { describe, expect, it, vi } from 'vitest';
import { contentHash } from '@shared/editor/save-conflict';
import { SaveCoordinator } from './save-coordinator';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
  const promise = new Promise<void>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

describe('SaveCoordinator', () => {
  it('shares completion for identical adjacent pending saves', async () => {
    const coordinator = new SaveCoordinator();
    coordinator.setBaseline('original');
    const pending = deferred();
    const write = vi.fn(() => pending.promise);
    const first = coordinator.save('changed', write);
    const second = coordinator.save('changed', write);
    expect(second).toBe(first);
    expect(write).toHaveBeenCalledExactlyOnceWith('changed', contentHash('original'));
    pending.resolve();
    await Promise.all([first, second]);
  });

  it('waits for the acknowledged baseline before writing another snapshot', async () => {
    const coordinator = new SaveCoordinator();
    coordinator.setBaseline('original');
    const pending = deferred();
    const write = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const first = coordinator.save('first', write);
    const second = coordinator.save('second', write);
    expect(write).toHaveBeenCalledTimes(1);
    pending.resolve();
    await Promise.all([first, second]);
    expect(write.mock.calls).toEqual([
      ['first', contentHash('original')], ['second', contentHash('first')],
    ]);
  });

  it('rejects waiting callers on failure and admits a later retry', async () => {
    const coordinator = new SaveCoordinator();
    coordinator.setBaseline('original');
    const pending = deferred();
    const write = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const first = coordinator.save('first', write);
    const second = coordinator.save('second', write);
    const outcomes = Promise.allSettled([first, second]);
    const error = new Error('disk full');
    pending.reject(error);
    expect(await outcomes).toEqual([
      { status: 'rejected', reason: error }, { status: 'rejected', reason: error },
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    await coordinator.save('retry', write);
    expect(write).toHaveBeenLastCalledWith('retry', contentHash('original'));
  });

  it('bypasses the hash only for an explicit overwrite', async () => {
    const coordinator = new SaveCoordinator();
    coordinator.setBaseline('original');
    const pending = deferred();
    const write = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const first = coordinator.save('first', write);
    const overwrite = coordinator.save('replacement', write, true);
    const following = coordinator.save('next', write);
    expect(write).toHaveBeenCalledTimes(1);
    pending.resolve();
    await Promise.all([first, overwrite, following]);
    expect(write.mock.calls).toEqual([
      ['first', contentHash('original')], ['replacement', undefined], ['next', contentHash('replacement')],
    ]);
  });

  it('preserves a nonadjacent return to an earlier snapshot', async () => {
    const coordinator = new SaveCoordinator();
    const pending = deferred();
    const write = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const requests = [coordinator.save('a', write), coordinator.save('b', write), coordinator.save('a', write)];
    pending.resolve();
    await Promise.all(requests);
    expect(write.mock.calls).toEqual([['a', undefined], ['b', contentHash('a')], ['a', contentHash('b')]]);
  });

  it('uses an externally refreshed baseline on the next save', async () => {
    const coordinator = new SaveCoordinator();
    const write = vi.fn().mockResolvedValue(undefined);
    await coordinator.save('first', write);
    coordinator.setBaseline('external');
    await coordinator.save('second', write);
    expect(write).toHaveBeenLastCalledWith('second', contentHash('external'));
  });
});
