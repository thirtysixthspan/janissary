import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommandQueue } from './useCommandQueue';

describe('core queue hook', () => {
  it('keeps its busy drain across rerenders and reads the latest transport and runner', async () => {
    const pending: string[] = [];
    const transport = {
      enqueue: vi.fn(async (line: string) => { pending.push(line); }),
      dequeue: vi.fn(async () => pending.shift() ?? null),
    };
    const firstRun = vi.fn(async () => true);
    const secondRun = vi.fn(async () => true);
    const onQueued = vi.fn();
    const { result, rerender } = renderHook(({ run, lines }) => useCommandQueue(
      transport, run, true, onQueued, lines,
    ), { initialProps: { run: firstRun, lines: [] as string[] } });
    const queue = result.current.queue;
    act(() => result.current.submit('work'));
    expect(onQueued).toHaveBeenCalledWith('work');
    rerender({ run: secondRun, lines: ['work'] });
    expect(result.current.queue).toBe(queue);
    expect(secondRun).not.toHaveBeenCalled();
    await act(async () => {
      queue.setBusy(false);
      await Promise.resolve();
    });
    expect(secondRun).toHaveBeenCalledWith('work', true);
    expect(firstRun).not.toHaveBeenCalled();
  });

  it('releases its drain on unmount', async () => {
    const transport = { enqueue: vi.fn(async () => {}), dequeue: vi.fn(async () => 'work') };
    const run = vi.fn(async () => true);
    const { result, unmount } = renderHook(() => useCommandQueue(transport, run, true, vi.fn(), []));
    const queue = result.current.queue;
    unmount();
    queue.setBusy(false);
    await Promise.resolve();
    expect(transport.dequeue).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
