import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useConnectionStatus } from './useConnectionStatus';
import type { ConnectionPhase } from './reconnect-policy';
import type { JanusClient } from './ws';

afterEach(() => vi.useRealTimers());

it('shows recovery briefly, cancels it on another failure, and releases its subscription', () => {
  vi.useFakeTimers();
  let update: (phase: ConnectionPhase) => void = () => {};
  const unsubscribe = vi.fn();
  const client = {
    connectionStatus: 'connected',
    onConnectionStatus: (listener: typeof update) => { update = listener; return unsubscribe; },
  } as unknown as JanusClient;
  const { result, unmount } = renderHook(() => useConnectionStatus(client));
  expect(result.current).toBe('connected');
  act(() => update('reconnecting'));
  expect(result.current).toBe('reconnecting');
  act(() => update('escalated'));
  expect(result.current).toBe('escalated');
  act(() => update('connected'));
  expect(result.current).toBe('reconnected');
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current).toBe('connected');
  act(() => { update('reconnecting'); update('connected'); update('escalated'); vi.advanceTimersByTime(2000); });
  expect(result.current).toBe('escalated');
  unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
