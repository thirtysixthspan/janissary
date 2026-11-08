import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { BackgroundReplyView, PendingAcpReplyNameView } from '@shared/protocol';
import { useBackgroundReplies } from './useBackgroundReplies';

it('renders background replies once across snapshots, hiding, and reconnect subscriptions', () => {
  const reply = { id: 'reply-1', output: 'Review the change' };
  const stop = vi.fn();
  const display = vi.fn();
  const replyIds = new Set<string>();
  let receive: (reply: BackgroundReplyView) => void = () => {};
  const subscribe = vi.fn((callback: typeof receive) => { receive = callback; callback(reply); return stop; });
  const { rerender, unmount } = renderHook(({ subscription }) => useBackgroundReplies(subscription, display, replyIds), { initialProps: { subscription: subscribe } });
  act(() => { receive(reply); });
  rerender({ subscription: vi.fn((callback: typeof receive) => { receive = callback; callback(reply); return stop; }) });
  expect(display).toHaveBeenCalledExactlyOnceWith('monitor', reply.output, reply);
  expect(replyIds).toEqual(new Set(['reply-1']));
  act(() => { receive({ id: 'reply-2', output: 'Another suggestion' }); });
  expect(display).toHaveBeenCalledTimes(2);
  expect(replyIds).toEqual(new Set(['reply-1', 'reply-2']));
  expect(display).toHaveBeenLastCalledWith('monitor', 'Another suggestion', { id: 'reply-2', output: 'Another suggestion' });
  unmount();
  expect(stop).toHaveBeenCalledTimes(2);
});

it('renders an ACP reply under its exact line', () => {
  const display = vi.fn();
  const replyIds = new Set<string>();
  const reply = { id: 'acp-1', output: '## Answer', line: 'acp summarize this' };

  renderHook(() => useBackgroundReplies((receive) => {
    receive(reply);
    return () => {};
  }, display, replyIds));

  expect(display).toHaveBeenCalledExactlyOnceWith('acp summarize this', '## Answer', reply);
});

it('keeps the monitor fallback for a reply without a line', () => {
  const display = vi.fn();
  const replyIds = new Set<string>();

  renderHook(() => useBackgroundReplies((receive) => {
    receive({ id: 'monitor-1', output: 'Review the change' });
    return () => {};
  }, display, replyIds));

  expect(display).toHaveBeenCalledExactlyOnceWith('monitor', 'Review the change', { id: 'monitor-1', output: 'Review the change' });
  expect(replyIds).toEqual(new Set(['monitor-1']));
});

it('passes a settled connection record through to the reply writer', () => {
  const display = vi.fn();
  const replyIds = new Set<string>();
  const reply: BackgroundReplyView = {
    id: 'acp-2', output: 'Answer', line: 'ask summarize this', record: { id: 'record-2', name: 'acp:ask:shell1' },
  };

  renderHook(() => useBackgroundReplies((receive) => {
    receive(reply);
    return () => {};
  }, display, replyIds));

  expect(display).toHaveBeenCalledExactlyOnceWith('ask summarize this', 'Answer', reply);
});

it('does not dedupe a pending name update against its later settled reply', () => {
  const display = vi.fn();
  const replyIds = new Set<string>();
  const pending = { id: 'acp-3', name: 'acp:ask:Renamed shell' };
  const settled: BackgroundReplyView = { id: 'acp-3', output: 'Answer', line: 'ask hello' };
  let receiveSettled: (reply: BackgroundReplyView) => void = () => {};
  let receivePending: (update: PendingAcpReplyNameView) => void = () => {};
  const subscribeSettled = (callback: typeof receiveSettled) => {
    receiveSettled = callback;
    return () => {};
  };
  const subscribePending = (callback: typeof receivePending) => {
    receivePending = callback;
    return () => {};
  };
  renderHook(() => useBackgroundReplies(subscribeSettled, display, replyIds, subscribePending));

  act(() => { receivePending(pending); });

  expect(display).toHaveBeenCalledExactlyOnceWith('', '', { ...pending, pending: true });
  expect(replyIds).toEqual(new Set());

  act(() => { receiveSettled(settled); });

  expect(display).toHaveBeenCalledTimes(2);
  expect(display).toHaveBeenLastCalledWith('ask hello', 'Answer', settled);
  expect(replyIds).toEqual(new Set(['acp-3']));

  act(() => { receivePending(pending); receiveSettled(settled); });
  expect(display).toHaveBeenCalledTimes(2);
});

it('suppresses a retained reply replay after the shell terminal reattaches', () => {
  const display = vi.fn();
  const replyIds = new Set<string>();
  const reply = { id: 'reply-1', output: 'Review the change' };
  let receive: (reply: BackgroundReplyView) => void = () => {};
  const initialSubscription = (callback: typeof receive) => {
    receive = callback;
    callback(reply);
    return () => {};
  };
  const reattachedSubscription = (callback: typeof receive) => {
    callback(reply);
    return () => {};
  };
  const { rerender } = renderHook(({ subscription }) => useBackgroundReplies(subscription, display, replyIds), {
    initialProps: { subscription: initialSubscription },
  });

  act(() => { receive(reply); });
  rerender({ subscription: reattachedSubscription });

  expect(display).toHaveBeenCalledExactlyOnceWith('monitor', reply.output, reply);
  expect(replyIds).toEqual(new Set(['reply-1']));
});
