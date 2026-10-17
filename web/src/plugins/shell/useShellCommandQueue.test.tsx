import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';
import { useShellCommandQueue } from './useShellCommandQueue';

function capabilities(rows: { line: string; receipt: string }[]) {
  const intent = vi.fn(async (name: string, payload?: unknown): Promise<unknown> => {
    if (name === 'dequeue-command') return rows.shift() ?? null;
    if (name === 'dispatch-command' && typeof payload === 'object' && payload !== null && 'discard' in payload) {
      return null;
    }
    return { queued: true };
  });
  return { intent, value: { intent } as unknown as TabPluginClientCapabilities };
}

describe('useShellCommandQueue', () => {
  it('uses structured dequeue and sends the paired receipt to the runner', async () => {
    const { intent, value } = capabilities([{ line: 'same', receipt: 'opaque-1' }]);
    const run = vi.fn(async (_line: string, _record?: boolean, receipt?: string) => {
      if (receipt) await value.intent('dispatch-command', { receipt });
      return false;
    });
    const { result } = renderHook(() => useShellCommandQueue(value, run, true, vi.fn(), ['same']));

    await act(async () => { result.current.queue.setBusy(false); });

    await waitFor(() => { expect(run).toHaveBeenCalledWith('same', false, 'opaque-1'); });
    expect(intent).toHaveBeenCalledWith('dequeue-command', null);
    expect(intent).not.toHaveBeenCalledWith('dequeue', null);
    expect(intent).toHaveBeenCalledWith('dispatch-command', { receipt: 'opaque-1' });
  });

  it('discards an outstanding receipt when the consumer unmounts', async () => {
    const { intent, value } = capabilities([{ line: 'pending', receipt: 'opaque-2' }]);
    const run = vi.fn(async () => await new Promise<boolean>(() => {}));
    const { result, unmount } = renderHook(() => useShellCommandQueue(value, run, true, vi.fn(), ['pending']));

    await act(async () => { result.current.queue.setBusy(false); });
    await waitFor(() => { expect(run).toHaveBeenCalled(); });
    unmount();

    await waitFor(() => {
      expect(intent).toHaveBeenCalledWith('dispatch-command', { receipt: 'opaque-2', discard: true });
    });
  });

  it('discards a receipt when a replacement terminal generation takes over', async () => {
    const { intent, value } = capabilities([{ line: 'old-generation', receipt: 'old-receipt' }]);
    const run = vi.fn(async () => await new Promise<boolean>(() => {}));
    const { result, rerender } = renderHook(
      ({ generation }: { generation: string }) => useShellCommandQueue(value, run, true, vi.fn(), ['old-generation'], generation),
      { initialProps: { generation: 'pty-old' } },
    );

    await act(async () => { result.current.queue.setBusy(false); });
    await waitFor(() => { expect(run).toHaveBeenCalled(); });
    rerender({ generation: 'pty-new' });

    await waitFor(() => {
      expect(intent).toHaveBeenCalledWith('dispatch-command', { receipt: 'old-receipt', discard: true });
    });
  });
});
