import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { BackgroundReplyView } from '@shared/protocol';
import { useBackgroundReplies } from './useBackgroundReplies';

it('renders background replies once across snapshots, hiding, and reconnect subscriptions', () => {
  const reply = { id: 'reply-1', output: 'Review the change' };
  const stop = vi.fn();
  const display = vi.fn();
  let receive: (reply: BackgroundReplyView) => void = () => {};
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

it('renders an ACP reply under its exact line', () => {
  const display = vi.fn();
  const reply = { id: 'acp-1', output: '## Answer', line: 'acp summarize this' };

  renderHook(() => useBackgroundReplies((receive) => {
    receive(reply);
    return () => {};
  }, display));

  expect(display).toHaveBeenCalledExactlyOnceWith('acp summarize this', '## Answer');
});

it('keeps the monitor fallback for a reply without a line', () => {
  const display = vi.fn();

  renderHook(() => useBackgroundReplies((receive) => {
    receive({ id: 'monitor-1', output: 'Review the change' });
    return () => {};
  }, display));

  expect(display).toHaveBeenCalledExactlyOnceWith('monitor', 'Review the change');
});
