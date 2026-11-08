import { expect, it, vi } from 'vitest';
import type { JanusClient, StateListener } from '../shared/ws/ws';
import type { StateEvent } from '@shared/protocol';
import { subscribeBackgroundReplies } from './background-replies';
import { subscribePendingAcpReplyNames } from './pending-acp-reply-names';

it('replays only completed replies exposed by the bound tab and releases the listener', () => {
  const receive = vi.fn();
  const stop = vi.fn();
  const state = { tabs: [{ label: 'owner', backgroundReplies: [{ id: 'one', output: 'owner reply' }] }, { label: 'other', backgroundReplies: [{ id: 'two', output: 'private reply' }] }] } as unknown as StateEvent;
  const client = { onState: (listener: StateListener) => { listener(state); return stop; } } as unknown as JanusClient;
  const unsubscribe = subscribeBackgroundReplies(client, 'owner', receive);
  expect(receive).toHaveBeenCalledExactlyOnceWith({ id: 'one', output: 'owner reply' });
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
});

it('replays pending ACP names only from the bound tab and releases the listener', () => {
  const receive = vi.fn();
  const stop = vi.fn();
  const state = {
    tabs: [
      { label: 'owner', pendingAcpReplyNames: [{ id: 'one', name: 'acp:ask:owner' }] },
      { label: 'other', pendingAcpReplyNames: [{ id: 'two', name: 'acp:tell:private' }] },
    ],
  } as unknown as StateEvent;
  const client = { onState: (listener: StateListener) => { listener(state); return stop; } } as unknown as JanusClient;
  const unsubscribe = subscribePendingAcpReplyNames(client, 'owner', receive);
  expect(receive).toHaveBeenCalledExactlyOnceWith({ id: 'one', name: 'acp:ask:owner' });
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
});
