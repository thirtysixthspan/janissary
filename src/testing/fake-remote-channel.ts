import { vi } from 'vitest';
import type { NavigatorListener } from '../remote/channel/types.js';
import type { ClientFrame } from '../remote/protocol-frames.js';

// Test-only: the one fake remote channel harness shared by the file command tests.
// Its listener accessor and filesystem-request guard are the canonical reply path;
// keep them intact so every executor test sees the same replies as the real transport.
export type RequestFrame = Extract<ClientFrame, { type: 'filesystem-request' }>;

type ReplyFrame = Parameters<NavigatorListener['onReply']>[0];

export function fakeChannel() {
  const sent: ClientFrame[] = [];
  let listener: NavigatorListener | undefined;
  const attachNavigator = vi.fn((_id: string, value: NavigatorListener) => { listener = value; });
  const channel = {
    attachNavigator,
    detachNavigator: vi.fn(),
    send: (frame: ClientFrame) => { sent.push(frame); },
  };
  const requests = () => sent.filter((frame): frame is RequestFrame => frame.type === 'filesystem-request');
  const reply = (result: unknown, error?: string) => {
    const request = requests().at(-1);
    if (request?.type !== 'filesystem-request') throw new Error('No request was sent.');
    listener?.onReply({
      type: 'filesystem-reply', session: request.session, request: request.request,
      ...(error ? { error } : { result }),
    } as ReplyFrame);
  };
  return { channel, attachNavigator, requests, reply, listener: () => listener };
}
