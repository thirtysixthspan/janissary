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
  const ownerUpdate = {
    id: 'one', name: 'acp:ask:owner', role: 'ask', echo: 'tell ← subagent:research completed',
  };
  const state = {
    tabs: [
      { label: 'owner', pendingAcpReplyNames: [ownerUpdate] },
      { label: 'other', pendingAcpReplyNames: [
        { id: 'two', name: 'acp:tell:private', role: 'tell', echo: 'ask ← subagent:review started' },
      ] },
    ],
  } as unknown as StateEvent;
  const client = { onState: (listener: StateListener) => { listener(state); return stop; } } as unknown as JanusClient;
  const unsubscribe = subscribePendingAcpReplyNames(client, 'owner', receive);
  expect(receive).toHaveBeenCalledExactlyOnceWith(ownerUpdate);
  unsubscribe();
  expect(stop).toHaveBeenCalledOnce();
});
