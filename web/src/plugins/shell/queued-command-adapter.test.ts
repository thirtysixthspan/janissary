import { describe, expect, it, vi } from 'vitest';
import { createQueuedCommandAdapter } from './queued-command-adapter';

function makeAdapter(rows: { line: string; receipt: string }[]) {
  const discard = vi.fn(async (_receipt: string) => {});
  const run = vi.fn(async (_line: string, _queued: boolean, _receipt?: string) => false);
  const adapter = createQueuedCommandAdapter({
    dequeue: async () => rows.shift() ?? null,
    discard,
  }, run);
  return { adapter, discard, run };
}

function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

describe('queued command adapter', () => {
  it('pairs identical lines with their individual FIFO receipts and leaves manual runs unpaired', async () => {
    const { adapter, run } = makeAdapter([
      { line: 'same', receipt: 'from-schedule' },
      { line: 'same', receipt: 'ordinary' },
    ]);

    await expect(adapter.dequeue()).resolves.toBe('same');
    await adapter.run('manual', false);
    await adapter.run('same', true);
    await expect(adapter.dequeue()).resolves.toBe('same');
    await adapter.run('same', true);

    expect(run).toHaveBeenNthCalledWith(1, 'manual', false, undefined);
    expect(run).toHaveBeenNthCalledWith(2, 'same', true, 'from-schedule');
    expect(run).toHaveBeenNthCalledWith(3, 'same', true, 'ordinary');
  });

  it('discards a receipt when the runner rejects and does not transfer it to a later line', async () => {
    const { adapter, discard, run } = makeAdapter([
      { line: 'first', receipt: 'rejected' },
      { line: 'second', receipt: 'next' },
    ]);
    run.mockRejectedValueOnce(new Error('dispatch rejected'));
    await adapter.dequeue();

    await expect(adapter.run('first', true)).rejects.toThrow('dispatch rejected');
    await adapter.dequeue();
    await adapter.run('second', true);

    expect(discard).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenLastCalledWith('second', true, 'next');
  });

  it('discards an outstanding receipt once on disposal and rejects a late dequeue', async () => {
    const { adapter, discard } = makeAdapter([{ line: 'pending', receipt: 'pending' }]);
    await adapter.dequeue();

    await adapter.dispose();
    await expect(adapter.dequeue()).resolves.toBeNull();

    expect(discard).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledWith('pending');
  });

  it('reattaches cleanly after a development lifecycle cleanup', async () => {
    const { adapter } = makeAdapter([{ line: 'after-remount', receipt: 'fresh' }]);
    await adapter.dispose();

    adapter.attach();

    await expect(adapter.dequeue()).resolves.toBe('after-remount');
  });

  it('races disposal with an in-flight dispatch and ignores its late completion', async () => {
    const { promise, resolve: finish } = withResolvers<boolean>();
    const { adapter, discard, run } = makeAdapter([{ line: 'dispatch', receipt: 'in-flight' }]);
    run.mockImplementationOnce(() => promise);
    await adapter.dequeue();
    const pending = adapter.run('dispatch', true);

    await adapter.dispose();
    finish(false);
    await pending;
    await adapter.dispose();

    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledWith('in-flight');
  });
});
