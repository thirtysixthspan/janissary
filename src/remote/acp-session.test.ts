import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRemoteAcpSession } from './acp-session.js';
import type { AcpSessionListener } from './channel/acp.js';
import type { RemoteChannel } from './channel/index.js';
import type { ClientFrame } from './protocol-frames.js';
import type { AcpLoopHandlers, AcpRunSnapshot } from '../acp/types.js';
import { CORE_MAX_STEPS } from '../acp/drive-loop.js';

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
  afterEach(() => vi.useRealTimers());

  it('attaches a listener for its id and sends the open frame', () => {
    const s = makeSession();

    expect(s.listeners.has('racp1')).toBe(true);
    expect(s.sent).toEqual([{
      type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
      env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
    }]);
  });

  it('carries the session options on the open frame when the launch sets them', () => {
    const fake = fakeChannel();
    const sessionMeta = { claudeCode: { options: { tools: [] } } };

    createRemoteAcpSession(fake.channel, { ...OPTIONS, sessionMeta }, { onError: vi.fn(), onConnect: vi.fn() });

    expect(fake.sent).toEqual([{
      type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
      env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
      sessionMeta,
    }]);
  });

  it('invokes the connect hook when the remote reports its handshake done', () => {
    const s = makeSession();

    s.listener().onReady(false);

    expect(s.onConnect).toHaveBeenCalledWith(false);
  });

  it('settles readiness and forwards typed activity', async () => {
    const onActivity = vi.fn();
    const fake = fakeChannel();
    const session = createRemoteAcpSession(fake.channel, { ...OPTIONS, autonomous: true, effort: { level: 'high', model: 'model-x' } }, {
      onError: vi.fn(), onConnect: vi.fn(), onActivity,
    });
    fake.listeners.get('racp1')?.onReady(false);
    session.prompt('hi', { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() });
    fake.listeners.get('racp1')?.onActivity('thought', 'planning');

    await expect(session.ready).resolves.toBe(false);
    expect(fake.sent[0]).toMatchObject({ autonomous: true, effort: { level: 'high', model: 'model-x' } });
    expect(onActivity).toHaveBeenCalledWith('thought', 'planning');
  });

  it('fails readiness and notifies the owner when the transport is lost', async () => {
    const onTransportLost = vi.fn();
    const fake = fakeChannel();
    const session = createRemoteAcpSession(fake.channel, OPTIONS, {
      onError: vi.fn(), onConnect: vi.fn(), onTransportLost,
    });

    fake.listeners.get('racp1')?.onTransportLost?.();

    await expect(session.ready).rejects.toThrow('Remote connection lost before agent readiness.');
    expect(onTransportLost).toHaveBeenCalledOnce();
    expect(fake.detached).toEqual(['racp1']);
  });

  it('waits for the remote release acknowledgment', async () => {
    const s = makeSession();
    const release = s.session.release();
    let settled = false;
    void release.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    s.listener().onClosed(true);

    await expect(release).resolves.toBe(true);
    expect(s.detached).toEqual(['racp1']);
  });

  it('shares one acknowledgment wait across concurrent release calls', async () => {
    const s = makeSession();
    const first = s.session.release();
    const second = s.session.release();

    expect(second).toBe(first);
    expect(s.sent.filter((frame) => frame.type === 'acp-close')).toHaveLength(1);
    s.listener().onClosed(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('bounds an unacknowledged close and reports uncertain release', async () => {
    vi.useFakeTimers();
    const s = makeSession();
    const release = s.session.release();
    const expectation = expect(release).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
    expect(s.detached).toEqual(['racp1']);
  });
});

describe('createRemoteAcpSession — prompting', () => {
  it('retains cancelled routing until the old terminal frame, then allows reuse', async () => {
    const s = makeSession();
    s.session.prompt('held', s.handlers);
    const cancellation = s.session.cancel();
    expect(s.session.cancel()).toBe(cancellation);
    expect(s.sent.at(-1)).toEqual({ type: 'acp-cancel', id: 'racp1' });
    const overlap = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    s.session.prompt('overlap', overlap);
    expect(overlap.onError).toHaveBeenCalledWith('ACP: a prompt is already running.');
    s.listener().onChunk('final');
    s.listener().onEnd('cancelled');
    await cancellation;
    expect(s.handlers.onChunk).toHaveBeenCalledWith('final');
    expect(s.handlers.onEnd).toHaveBeenCalledExactlyOnceWith('cancelled');
    s.session.prompt('next', overlap);
    s.listener().onChunk('new');
    expect(overlap.onChunk).toHaveBeenCalledWith('new');
  });

  it('sends an idle addressed cancel without waiting for a nonexistent end', async () => {
    const s = makeSession();
    await s.session.cancel();
    expect(s.sent.at(-1)).toEqual({ type: 'acp-cancel', id: 'racp1' });
  });

  it.each(['fatal', 'lost', 'kill'])('releases cancel and readiness waiters on %s', async (reason) => {
    const s = makeSession();
    s.session.prompt('held', s.handlers);
    const pending = s.session.cancel();
    const listener = s.listener();
    if (reason === 'fatal') listener.onError('gone', true);
    else if (reason === 'lost') listener.onTransportLost?.();
    else s.session.kill();
    await pending;
    await expect(s.session.ready).rejects.toThrow();
    listener.onChunk('late');
    expect(s.handlers.onChunk).not.toHaveBeenCalled();
    if (reason === 'kill') listener.onClosed(true);
  });

  it('clears a nonfatal terminal before a handler starts its successor', () => {
    const s = makeSession();
    const next = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    s.handlers.onError.mockImplementation(() => { s.session.prompt('next', next); });
    s.session.prompt('first', s.handlers);
    s.listener().onError('rate limit', false);
    s.listener().onChunk('new');
    expect(next.onChunk).toHaveBeenCalledWith('new');
  });
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

describe('createRemoteAcpSession — running', () => {
  const snapshot: AcpRunSnapshot = { kind: 'agent', grants: [], askUser: false };

  function runEvents(): AcpLoopHandlers {
    return {
      startTurn: vi.fn(), chunk: vi.fn(), endTurn: vi.fn(),
      startCommand: vi.fn(), ranCommand: vi.fn(), finished: vi.fn(), error: vi.fn(),
    };
  }

  it('sends a run frame, refuses an overlapping run, and admits the next after the end', () => {
    const s = makeSession();
    const first = runEvents();

    s.session.run('summarize', snapshot, vi.fn(), first);

    expect(s.session.remote).toBe(true);
    expect(s.sent.at(-1)).toEqual({ type: 'acp-run', id: 'racp1', text: 'summarize', snapshot });

    const overlap = runEvents();
    s.session.run('overlap', snapshot, vi.fn(), overlap);

    expect(overlap.error).toHaveBeenCalledWith('ACP: a prompt is already running.');
    expect(s.sent.filter((frame) => frame.type === 'acp-run')).toHaveLength(1);

    s.listener().onRunEnd('answered');

    expect(first.finished).toHaveBeenCalledWith('answered', CORE_MAX_STEPS);
    expect(overlap.finished).not.toHaveBeenCalled();
    const next = runEvents();
    s.session.run('next', snapshot, vi.fn(), next);
    expect(s.sent.filter((frame) => frame.type === 'acp-run')).toHaveLength(2);
    expect(next.error).not.toHaveBeenCalled();
  });

  it('opens a turn, accumulates deltas, resets on a new turn, and closes with the display text', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);
    const listener = s.listener();

    listener.onTurn({ type: 'acp-turn', id: 'racp1', phase: 'start', first: true });
    listener.onChunk('first ');
    listener.onChunk('second');
    expect(events.startTurn).toHaveBeenCalledWith(true);
    expect(events.chunk.mock.calls).toEqual([['first '], ['first second']]);

    listener.onTurn({ type: 'acp-turn', id: 'racp1', phase: 'start', first: false });
    listener.onChunk('again');
    expect(events.startTurn).toHaveBeenLastCalledWith(false);
    expect(events.chunk).toHaveBeenLastCalledWith('again');

    listener.onTurn({ type: 'acp-turn', id: 'racp1', phase: 'end', display: 'Final' });
    expect(events.endTurn).toHaveBeenCalledWith('Final');
  });

  it.each(['answered', 'capped'] as const)('maps an %s run end to the core step cap', (reason) => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onRunEnd(reason);

    expect(events.finished).toHaveBeenCalledWith(reason, CORE_MAX_STEPS);
  });

  it('drains a cancelled run without a finished event, then admits the next run', async () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    const cancellation = s.session.cancel();
    expect(s.sent.at(-1)).toEqual({ type: 'acp-cancel', id: 'racp1' });
    s.listener().onRunEnd('cancelled');
    await cancellation;

    expect(events.finished).not.toHaveBeenCalled();
    expect(events.error).not.toHaveBeenCalled();
    s.session.run('next', snapshot, vi.fn(), runEvents());
    expect(s.sent.filter((frame) => frame.type === 'acp-run')).toHaveLength(2);
  });

  it('routes a non-fatal error to the run events', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onError('rate limited', false);

    expect(events.error).toHaveBeenCalledWith('rate limited');
    expect(s.onError).not.toHaveBeenCalled();
  });

  it('reports a transport loss mid-run to the run events', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onTransportLost?.();

    expect(events.error).toHaveBeenCalledWith('Remote connection lost before agent readiness.');
    expect(s.detached).toEqual(['racp1']);
  });

  it.each(['All tests pass', ''])('answers a caller tool request with output %j', async (output) => {
    const s = makeSession();
    const events = runEvents();
    const runCaller = vi.fn(() => Promise.resolve(output));
    s.session.run('go', snapshot, runCaller, events);

    s.listener().onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 4, command: 'npm test' });
    await vi.waitFor(() => expect(events.ranCommand).toHaveBeenCalled());

    expect(events.startCommand).toHaveBeenCalledWith('npm test', false);
    expect(runCaller).toHaveBeenCalledWith('npm test');
    expect(events.startCommand!.mock.invocationCallOrder[0])
      .toBeLessThan(runCaller.mock.invocationCallOrder[0]!);
    expect(events.ranCommand).toHaveBeenCalledWith('npm test', output, false);
    expect(s.sent.at(-1)).toEqual({ type: 'acp-tool-result', id: 'racp1', request: 4, output });
  });

  it('answers a failed caller tool with the error text and no command event', async () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(async () => { throw new Error('database unavailable'); }), events);

    s.listener().onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 9, command: 'db status' });
    await vi.waitFor(() => expect(s.sent.at(-1)).toMatchObject({ type: 'acp-tool-result', error: 'database unavailable' }));

    expect(events.ranCommand).not.toHaveBeenCalled();
    expect(s.sent.at(-1)).toEqual({ type: 'acp-tool-result', id: 'racp1', request: 9, error: 'database unavailable' });
  });

  it('answers a failed caller tool carrying no error text with a non-empty fallback', async () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(async () => {
      const empty = new Error('placeholder');
      empty.message = '';
      throw empty;
    }), events);

    s.listener().onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 10, command: 'db status' });
    await vi.waitFor(() => expect(s.sent.at(-1)).toMatchObject({ type: 'acp-tool-result', error: 'Command failed.' }));

    expect(events.ranCommand).not.toHaveBeenCalled();
    expect(s.sent.at(-1)).toEqual({ type: 'acp-tool-result', id: 'racp1', request: 10, error: 'Command failed.' });
  });

  it('ignores tool frames with no run in flight', () => {
    const s = makeSession();
    const listener = s.listener();
    const before = s.sent.length;

    listener.onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 1, command: 'npm test' });
    listener.onToolStep({ type: 'acp-tool-step', id: 'racp1', command: 'ls', result: 'a.txt', workspace: true });

    expect(s.sent).toHaveLength(before);
  });

  it('drops a caller result that resolves after cancel and a successor run starts', async () => {
    const s = makeSession();
    const events = runEvents();
    const caller = Promise.withResolvers<string>();
    const runCaller = vi.fn(() => caller.promise);
    s.session.run('go', snapshot, runCaller, events);
    s.listener().onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 2, command: 'sleep 5' });
    const cancellation = s.session.cancel();
    s.listener().onRunEnd('cancelled');
    await cancellation;
    const successor = runEvents();
    s.session.run('next', snapshot, vi.fn(), successor);

    caller.resolve('late output');
    await Promise.resolve();
    await Promise.resolve();

    expect(events.ranCommand).not.toHaveBeenCalled();
    expect(successor.startCommand).not.toHaveBeenCalled();
    expect(successor.ranCommand).not.toHaveBeenCalled();
    expect(s.sent.filter((frame) => frame.type === 'acp-tool-result')).toEqual([]);
  });

  it('drops a caller result that resolves after release', async () => {
    const s = makeSession();
    const events = runEvents();
    const caller = Promise.withResolvers<string>();
    s.session.run('go', snapshot, () => caller.promise, events);
    s.listener().onToolRequest({ type: 'acp-tool-request', id: 'racp1', request: 6, command: 'sleep 5' });
    const releasing = s.session.release();

    caller.resolve('late output');
    await Promise.resolve();
    await Promise.resolve();

    expect(events.error).toHaveBeenCalledWith('ACP session closed.');
    expect(events.ranCommand).not.toHaveBeenCalled();
    expect(s.sent.filter((frame) => frame.type === 'acp-tool-result')).toEqual([]);
    s.listener().onClosed(true);
    await expect(releasing).resolves.toBe(true);
  });

  it('maps a far-side workspace step onto both command events', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onToolStep({ type: 'acp-tool-step', id: 'racp1', command: 'ls', result: 'a.txt', workspace: true });

    expect(events.startCommand).toHaveBeenCalledWith('ls', true);
    expect(events.ranCommand).toHaveBeenCalledWith('ls', 'a.txt', true, undefined);
  });

  it('maps a far-side refusal onto both command events', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onToolStep({
      type: 'acp-tool-step', id: 'racp1', command: 'rm -rf /', result: 'Command disabled.', workspace: false, refused: 'disabled',
    });

    expect(events.startCommand).toHaveBeenCalledWith('rm -rf /', false);
    expect(events.ranCommand).toHaveBeenCalledWith('rm -rf /', 'Command disabled.', false, 'disabled');
  });

  it('passes an absent refusal through as undefined', () => {
    const s = makeSession();
    const events = runEvents();
    s.session.run('go', snapshot, vi.fn(), events);

    s.listener().onToolStep({ type: 'acp-tool-step', id: 'racp1', command: 'pwd', result: '/home/me', workspace: false });

    expect(events.startCommand).toHaveBeenCalledWith('pwd', false);
    expect(events.ranCommand).toHaveBeenCalledWith('pwd', '/home/me', false, undefined);
  });
});

// The split the design rests on: killing a session over a rate limit would throw away the whole
// accumulated conversation, and keeping a dead one means the next prompt writes into a corpse.
describe('createRemoteAcpSession — errors', () => {
  it.each([false, true])('fails a cancellation write without stranding an active turn (active: %s)', async (active) => {
    const s = makeSession();
    if (active) s.session.prompt('held', s.handlers);
    s.channel.send = () => { throw new Error('write failed'); };
    await expect(s.session.cancel()).rejects.toThrow('ACP: cancellation failed: write failed');
    await expect(s.session.ready).rejects.toThrow('write failed');
    expect(s.onError).toHaveBeenCalledExactlyOnceWith('ACP: cancellation failed: write failed');
    expect(s.detached).toEqual(['racp1']);
  });

  it('settles release immediately when its close frame cannot be written', async () => {
    const s = makeSession();
    s.channel.send = () => { throw new Error('write failed'); };
    await expect(s.session.release()).resolves.toBe(false);
    expect(s.detached).toEqual(['racp1']);
  });
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
    const listener = s.listener();
    listener.onError('ACP agent exited.', true);

    listener.onChunk('too late');

    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });
});

describe('createRemoteAcpSession — killing', () => {
  it('sends the close frame and detaches the listener', () => {
    const s = makeSession();

    s.session.kill();

    expect(s.sent.at(-1)).toEqual({ type: 'acp-close', id: 'racp1' });
    expect(s.detached).toEqual([]);
    s.listener().onClosed(true);
    expect(s.detached).toEqual(['racp1']);
  });

  it('is idempotent', () => {
    const s = makeSession();

    s.session.kill();
    s.session.kill();

    expect(s.sent.filter((f) => f.type === 'acp-close')).toHaveLength(1);
    s.listener().onClosed(true);
    expect(s.detached).toEqual(['racp1']);
  });

  // The channel drops frames for a detached id, so a chunk still in flight from a session `acp
  // reset` disposed cannot land in its successor's transcript entry.
  it('leaves a chunk arriving after the kill reaching nothing', () => {
    const s = makeSession();
    s.session.prompt('hi', s.handlers);
    const listener = s.listener();

    s.session.kill();
    s.listener().onClosed(true);
    listener.onChunk('stale');

    expect(s.handlers.onChunk).not.toHaveBeenCalled();
  });
});
