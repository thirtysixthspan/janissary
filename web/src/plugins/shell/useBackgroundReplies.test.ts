import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useBackgroundReplies } from './useBackgroundReplies';

it('renders background replies once across snapshots, hiding, and reconnect subscriptions', () => {
  const reply = { id: 'reply-1', output: 'Review the change' };
  const stop = vi.fn();
  const display = vi.fn();
  let receive: (reply: { id: string; output: string }) => void = () => {};
  const subscribe = vi.fn((callback: typeof receive) => { receive = callback; callback(reply); return stop; });
  const { rerender, unmount } = renderHook(({ subscription }) => useBackgroundReplies(subscription, display), { initialProps: { subscription: subscribe } });
  act(() => { receive(reply); });
  rerender({ subscription: vi.fn((callback: typeof receive) => { receive = callback; callback(reply); return stop; }) });
  expect(display).toHaveBeenCalledExactlyOnceWith('monitor', reply.output);
  act(() => { receive({ id: 'reply-2', output: 'Another suggestion' }); });
  expect(display).toHaveBeenCalledTimes(2);
  unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});
