import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { NativeNotificationEvent, StateEvent } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useNativeNotifications } from './useNativeNotifications';

it('subscribes once to state and alert events and releases both on unmount', () => {
  const unstate = vi.fn();
  const unevent = vi.fn();
  const onState = vi.fn((_listener: (state: StateEvent) => void) => unstate);
  const onNativeNotification = vi.fn((_listener: (event: NativeNotificationEvent) => void) => unevent);
  const client = { onState, onNativeNotification } as unknown as JanusClient;
  const { unmount } = renderHook(() => useNativeNotifications(client));
  expect(onState).toHaveBeenCalledOnce();
  expect(onNativeNotification).toHaveBeenCalledOnce();
  unmount();
  expect(unstate).toHaveBeenCalledOnce();
  expect(unevent).toHaveBeenCalledOnce();
});
