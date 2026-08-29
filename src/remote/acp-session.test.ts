import { describe, it, expect, vi } from 'vitest';
import { createRemoteAcpSession } from './acp-session.js';
import type { AcpSessionListener } from './channel.js';
import type { RemoteChannel } from './channel.js';
import type { ClientFrame } from './protocol.js';

const OPTIONS = {
  id: 'racp1',
  command: 'opencode',
  args: ['acp'],
  env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' },
  offline: false,
};

// A fake channel: the adapter's whole job is turning frames into callbacks, so both directions are
// observable without a transport, a state machine, or a real ssh session.
function fakeChannel() {
  const sent: ClientFrame[] = [];
  const listeners = new Map<string, AcpSessionListener>();
  const detached: string[] = [];
  const channel = {
    send: (frame: ClientFrame) => { sent.push(frame); },
    attachAcp: (id: string, listener: AcpSessionListener) => { listeners.set(id, listener); },
    detachAcp: (id: string) => { detached.push(id); listeners.delete(id); },
  } as unknown as RemoteChannel;
  return { channel, sent, listeners, detached };
}

function makeSession(hooks?: { onError?: ReturnType<typeof vi.fn>; onConnect?: ReturnType<typeof vi.fn> }) {
  const fake = fakeChannel();
  const onError = hooks?.onError ?? vi.fn();
  const onConnect = hooks?.onConnect ?? vi.fn();
  const session = createRemoteAcpSession(fake.channel, OPTIONS, { onError, onConnect });
  const handlers = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
  return { ...fake, session, handlers, onError, onConnect, listener: () => fake.listeners.get('racp1')! };
}

describe('createRemoteAcpSession — opening', () => {
  it('attaches a listener for its id and sends the open frame', () => {
    const s = makeSession();

    expect(s.listeners.has('racp1')).toBe(true);
    expect(s.sent).toEqual([{
      type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
      env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
    }]);
  });

  it('invokes the connect hook when the remote reports its handshake done', () => {
    const s = makeSession();

    s.listener().onReady();

    expect(s.onConnect).toHaveBeenCalledOnce();
  });
});

describe('createRemoteAcpSession — prompting', () => {
  it('sends the prompt frame and routes chunks and the stop reason to its handlers', () => {
    const s = makeSession();

    s.session.prompt('summarize this', s.handlers);
    s.listener().onChunk('first ');
    s.listener().onChunk('second');
    s.listener().onEnd('end_turn');

    expect(s.sent.at(-1)).toEqual({ type: 'acp-prompt', id: 'racp1', text: 'summarize this' });
    expect(s.handlers.onChunk.mock.calls).toEqual([['first '], ['second']]);
    expect(s.handlers.onEnd).toHaveBeenCalledWith('end_turn');
  });

  it('drops a chunk arriving with no prompt in flight', () => {
    const s = makeSession();

    expect(() => { s.listener().onChunk('stray'); }).not.toThrow();
    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });

  it('routes a second prompt to its own handlers, not the finished one\'s', () => {
    const s = makeSession();
    s.session.prompt('first', s.handlers);
    s.listener().onEnd('end_turn');
    const second = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };

    s.session.prompt('second', second);
    s.listener().onChunk('reply');

    expect(second.onChunk).toHaveBeenCalledWith('reply');
    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });
});

// The split the design rests on: killing a session over a rate limit would throw away the whole
// accumulated conversation, and keeping a dead one means the next prompt writes into a corpse.
describe('createRemoteAcpSession — errors', () => {
  it('sends a non-fatal error to the running prompt only', () => {
    const s = makeSession();
    s.session.prompt('hi', s.handlers);

    s.listener().onError('rate limited', false);

    expect(s.handlers.onError).toHaveBeenCalledWith('rate limited');
    expect(s.onError).not.toHaveBeenCalled();
  });

  it('sends a fatal error to the connection hook when no prompt is in flight', () => {
    const s = makeSession();

    s.listener().onError('ACP agent exited.', true);

    expect(s.onError).toHaveBeenCalledWith('ACP agent exited.');
    expect(s.handlers.onError).not.toHaveBeenCalled();
  });

  // Both, so the running loop terminates rather than waiting on a reply that is never coming.
  it('sends a fatal error during a prompt to the prompt and the connection hook alike', () => {
    const s = makeSession();
    s.session.prompt('hi', s.handlers);

    s.listener().onError('ACP agent exited.', true);

    expect(s.handlers.onError).toHaveBeenCalledWith('ACP agent exited.');
    expect(s.onError).toHaveBeenCalledWith('ACP agent exited.');
  });

  it('clears the in-flight prompt after a fatal error, so a late chunk reaches nothing', () => {
    const s = makeSession();
    s.session.prompt('hi', s.handlers);
    s.listener().onError('ACP agent exited.', true);

    s.listener().onChunk('too late');

    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });
});

describe('createRemoteAcpSession — killing', () => {
  it('sends the close frame and detaches the listener', () => {
    const s = makeSession();

    s.session.kill();

    expect(s.sent.at(-1)).toEqual({ type: 'acp-close', id: 'racp1' });
    expect(s.detached).toEqual(['racp1']);
  });

  it('is idempotent', () => {
    const s = makeSession();

    s.session.kill();
    s.session.kill();

    expect(s.sent.filter((f) => f.type === 'acp-close')).toHaveLength(1);
    expect(s.detached).toEqual(['racp1']);
  });

  // The channel drops frames for a detached id, so a chunk still in flight from a session `acp
  // reset` disposed cannot land in its successor's transcript entry.
  it('leaves a chunk arriving after the kill reaching nothing', () => {
    const s = makeSession();
    s.session.prompt('hi', s.handlers);
    const listener = s.listener();

    s.session.kill();
    listener.onChunk('stale');

    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });
});
