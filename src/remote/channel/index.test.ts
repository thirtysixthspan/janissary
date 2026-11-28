import { afterEach, describe, it, expect, vi } from 'vitest';
import { RemoteChannel } from './index.js';
import type { ChannelTransport, ChannelFrame } from './types.js';
import { REMOTE_SHUTDOWN_DRAIN_MS } from '../shutdown-drain.js';
import { encodeFrame, encodeHandshake, HANDSHAKE_SENTINEL, REMOTE_PROTOCOL_VERSION } from '../protocol.js';

function harness(write?: (data: string) => void) {
  const written: string[] = [];
  const kill = vi.fn();
  const transport: ChannelTransport = { id: 'pty1', write: write ?? ((d) => { written.push(d); }), kill };
  const terminal: string[] = [];
  const frames: ChannelFrame[] = [];
  const errors: string[] = [];
  const closes = vi.fn();
  const attached = vi.fn();
  const truncated = vi.fn();
  const finalClose = vi.fn();
  const channel = new RemoteChannel(transport, {
    onTerminalData: (d) => { terminal.push(d); },
    onAttached: attached,
    onFrame: (f) => { frames.push(f); },
    onError: (m) => { errors.push(m); },
    onClose: closes,
    onFinalClose: finalClose,
    onTruncatedReplay: truncated,
  });
  return { channel, written, terminal, frames, errors, closes, attached, truncated, kill, finalClose };
}

afterEach(() => vi.useRealTimers());

describe('RemoteChannel — authenticating', () => {
  it('passes pre-handshake bytes through to the terminal as they arrive', () => {
    const h = harness();
    h.channel.receive("admin@devbox's password: ");
    expect(h.terminal).toEqual(["admin@devbox's password: "]);
  });

  it('passes keystrokes straight through to the ssh session', () => {
    const h = harness();
    h.channel.write('hunter2\r');
    expect(h.written).toEqual(['hunter2\r']);
  });

  it('sends no frame while still authenticating', () => {
    const h = harness();
    h.channel.send({ type: 'provision', label: 'claude' });
    expect(h.written).toEqual([]);
  });

  it('reports itself as not attached until the handshake lands', () => {
    const h = harness();
    h.channel.receive('Last login: today\n');
    expect(h.channel.attached).toBe(false);
  });
});

describe('RemoteChannel — handshake', () => {
  it('flips to attached, reports the handshake, and stops echoing to the terminal', () => {
    const h = harness();
    h.channel.receive(`motd\n${encodeHandshake()}\n`);
    expect(h.terminal).toEqual(['motd\n']);
    expect(h.channel.attached).toBe(true);
    expect(h.attached).toHaveBeenCalledWith({ version: REMOTE_PROTOCOL_VERSION });

    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'x' })}\n`);
    expect(h.terminal).toEqual(['motd\n']);
  });

  it('holds the sentinel back until its line is complete', () => {
    const h = harness();
    const line = encodeHandshake();
    h.channel.receive(line.slice(0, 10));
    expect(h.channel.attached).toBe(false);
    expect(h.terminal).toEqual([]);
    h.channel.receive(`${line.slice(10)}\n`);
    expect(h.channel.attached).toBe(true);
  });

  it('rejects a mismatched protocol version and kills the session', () => {
    const h = harness();
    h.channel.receive(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: REMOTE_PROTOCOL_VERSION + 1, root: '/x' })}\n`);
    expect(h.errors[0]).toContain(String(REMOTE_PROTOCOL_VERSION));
    expect(h.kill).toHaveBeenCalled();
    expect(h.channel.attached).toBe(false);
  });
});

describe('RemoteChannel — attached', () => {
  function attachedChannel() {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    return h;
  }

  it('writes one newline-terminated frame per send', () => {
    const h = attachedChannel();
    h.channel.send({ type: 'provision', label: 'claude' });
    expect(h.written).toEqual([`${encodeFrame({ type: 'provision', label: 'claude' })}\n`]);
  });

  it('disconnects before closing the transport, so later process frames are ignored', () => {
    const h = attachedChannel();
    h.channel.disconnect();
    h.channel.send({ type: 'kill', id: 'r1' });
    expect(h.kill).toHaveBeenCalledOnce();
    expect(h.written).toEqual([]);
  });

  it('keeps the transport briefly after final shutdown frames, then closes it', () => {
    vi.useFakeTimers();
    const h = attachedChannel();
    h.channel.finish();
    h.channel.closeAfterShutdown();

    expect(h.written.at(-1)).toBe(`${encodeFrame({ type: 'shutdown' })}\n`);
    expect(h.kill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('cancels the shutdown fallback when the transport exits', () => {
    vi.useFakeTimers();
    const h = attachedChannel();
    h.channel.finish();
    h.channel.closeAfterShutdown();
    h.channel.closed();

    vi.advanceTimersByTime(REMOTE_SHUTDOWN_DRAIN_MS);
    expect(h.kill).not.toHaveBeenCalled();
  });

  it('dispatches channel-level frames to the owner', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'workspace-ready', dir: '/srv/ws' })}\n`);
    expect(h.frames).toEqual([{ type: 'workspace-ready', dir: '/srv/ws' }]);
  });

  it('routes output and exit frames to the session that owns the id', () => {
    const h = attachedChannel();
    const onOutput = vi.fn();
    const onExit = vi.fn();
    h.channel.attach('r1', { onOutput, onExit });
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'hi' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'exit', id: 'r1', exitCode: 3 })}\n`);
    expect(onOutput).toHaveBeenCalledWith('hi');
    expect(onExit).toHaveBeenCalledWith(3);
    expect(h.frames).toEqual([]);
  });

  it('drops a detached session\'s routing', () => {
    const h = attachedChannel();
    const onOutput = vi.fn();
    h.channel.attach('r1', { onOutput, onExit: vi.fn() });
    h.channel.detach('r1');
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'hi' })}\n`);
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('routes filesystem replies and events only to the attached navigator', () => {
    const h = attachedChannel();
    const onReply = vi.fn();
    const onEvent = vi.fn();
    h.channel.attachNavigator('files1', { onReply, onEvent });
    h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'files1', request: 'q1', result: [] })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'filesystem-event', session: 'files1', path: 'src' })}\n`);
    expect(onReply).toHaveBeenCalledWith({ type: 'filesystem-reply', session: 'files1', request: 'q1', result: [] });
    expect(onEvent).toHaveBeenCalledWith('src');
    expect(h.frames).toEqual([]);
  });

  it('drops replies for a detached navigator without failing the transport', () => {
    const h = attachedChannel();
    const onReply = vi.fn();
    h.channel.attachNavigator('files1', { onReply, onEvent: vi.fn() });
    h.channel.detachNavigator('files1');
    h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'files1', request: 'q1', error: 'denied' })}\n`);
    expect(onReply).not.toHaveBeenCalled();
    expect(h.kill).not.toHaveBeenCalled();
  });

  it('buffers a frame split across two data events and parses it once complete', () => {
    const h = attachedChannel();
    const line = encodeFrame({ type: 'workspace-ready', dir: '/srv/ws' });
    h.channel.receive(line.slice(0, 12));
    expect(h.frames).toEqual([]);
    h.channel.receive(`${line.slice(12)}\n`);
    expect(h.frames).toEqual([{ type: 'workspace-ready', dir: '/srv/ws' }]);
  });

  it('parses several frames arriving in one read', () => {
    const h = attachedChannel();
    h.channel.receive(
      `${encodeFrame({ type: 'workspace-ready', dir: '/a' })}\n${encodeFrame({ type: 'transcript', blocks: ['b'] })}\n`,
    );
    expect(h.frames).toEqual([
      { type: 'workspace-ready', dir: '/a' },
      { type: 'transcript', blocks: ['b'] },
    ]);
  });

  // The remote tty maps \n to \r\n on the way out; trimming each line is what absorbs that.
  it('tolerates carriage returns the remote tty adds to each line', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'workspace-failed', message: 'nope' })}\r\n`);
    expect(h.frames).toEqual([{ type: 'workspace-failed', message: 'nope' }]);
  });

  it('hands a name-in-use answer, with and without its removal details, to onFrame', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'name-in-use', label: 'claude' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'name-in-use', label: 'claude', path: '/srv/ws/claude', reason: 'EACCES' })}\n`);
    expect(h.frames).toEqual([
      { type: 'name-in-use', label: 'claude' },
      { type: 'name-in-use', label: 'claude', path: '/srv/ws/claude', reason: 'EACCES' },
    ]);
    expect(h.errors).toEqual([]);
  });

  it('hands a clone offer and a root refusal to onFrame', () => {
    const h = attachedChannel();
    const offer = { type: 'clone-offer', path: '/home/ada/repo', url: 'https://github.com/o/repo.git', home: '/home/ada' } as const;
    const refused = { type: 'root-refused', refusal: { kind: 'not-repository', path: '/srv/proj' } } as const;
    h.channel.receive(`${encodeFrame(offer)}\n${encodeFrame(refused)}\n`);
    expect(h.frames).toEqual([offer, refused]);
    expect(h.errors).toEqual([]);
  });

  it('still hands every other tab-level frame to onFrame', () => {
    const h = attachedChannel();
    const frames = [
      { type: 'workspace-ready', dir: '/srv/ws' },
      { type: 'workspace-failed', message: 'nope' },
      { type: 'transcript', blocks: ['b'] },
      { type: 'browser-exited', id: 'r1' },
      { type: 'attach-result', accepted: true },
      { type: 'session-state-result', processes: [] },
    ] as const;
    for (const frame of frames) h.channel.receive(`${encodeFrame(frame)}\n`);
    expect(h.frames).toEqual(frames);
    expect(h.errors).toEqual([]);
  });

  it('fails the channel on a frame outside the union', () => {
    const h = attachedChannel();
    h.channel.receive(`${JSON.stringify({ type: 'exec', id: 'r1' })}\n`);
    expect(h.errors[0]).toContain('Unknown remote frame type "exec"');
    expect(h.kill).toHaveBeenCalled();
  });

  it('fails the channel on a frame that only the local side may send', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'kill', id: 'r1' })}\n`);
    expect(h.errors[0]).toContain('Unexpected remote frame "kill"');
  });

  // `ssh -t` folds the far side's stderr into the frame stream, so anything the remote prints
  // outside the protocol arrives here. Killing the transport over it took the session with it —
  // including the shutdown sequence already queued behind it, which is how a closed harness tab left
  // its remote harness running and its workspace in place.
  it.each([
    "Unhandled pty write error [Error: EIO: i/o error, write] { errno: -5, code: 'EIO' }",
    'Warning: Permanently added devbox to the list of known hosts.',
    '"a bare json string"',
  ])('keeps the channel on far-side output that is not a frame: %s', (line) => {
    const h = attachedChannel();
    h.channel.receive(`${line}\n`);

    expect(h.terminal).toContain(line);
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.channel.attached).toBe(true);
  });

  it('handles the frames after a stray line normally', () => {
    const h = attachedChannel();
    h.channel.receive('Unhandled pty write error\n');
    h.channel.receive(`${encodeFrame({ type: 'workspace-failed', message: 'nope' })}\n`);

    expect(h.frames).toEqual([{ type: 'workspace-failed', message: 'nope' }]);
  });

  // The shutdown sequence is what a stray line used to discard: the transport died before the drain,
  // so nothing of what `finish` wrote reached the peer.
  it('still sends the shutdown sequence after a stray line', () => {
    const h = attachedChannel();
    h.channel.receive('Unhandled pty write error\n');
    h.channel.finish();

    expect(h.written).toContain(`${encodeFrame({ type: 'shutdown' })}\n`);
  });
});

describe('RemoteChannel — ACP session routing', () => {
  it.each(['authentication', 'disconnect', 'closed', 'fail', 'finish'])('settles all ACP listeners on %s', (phase) => {
    const h = harness();
    if (phase !== 'authentication') h.channel.receive(`${encodeHandshake()}\n`);
    const first = {
      onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(),
      onRunEnd: vi.fn(), onError: vi.fn(), onTransportLost: vi.fn(),
    };
    const second = { ...first, onTransportLost: vi.fn() };
    first.onTransportLost.mockImplementation(() => { h.channel.detachAcp('second'); });
    h.channel.attachAcp('first', first);
    h.channel.attachAcp('second', second);
    switch (phase) {
    case 'disconnect': { h.channel.disconnect(); break; }
    case 'fail': { h.channel.receive('{"type":"acp-cancel","id":"first"}\n'); break; }
    case 'finish': { h.channel.finish(); break; }
    default: { h.channel.closed(); }
    }
    if (phase === 'finish') expect(first.onError).toHaveBeenCalledTimes(2);
    else {
      expect(first.onTransportLost).toHaveBeenCalledOnce();
      expect(second.onTransportLost).toHaveBeenCalledOnce();
    }
  });

  it('fails an unavailable cancel only on its addressed session', () => {
    const h = harness();
    const onError = vi.fn();
    const otherError = vi.fn();
    h.channel.attachAcp('first', { onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(), onRunEnd: vi.fn(), onError });
    h.channel.attachAcp('second', { onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(), onRunEnd: vi.fn(), onError: otherError });
    h.channel.send({ type: 'acp-cancel', id: 'first' });
    expect(onError).toHaveBeenCalledWith('ACP: cancellation failed: Remote connection unavailable.', true);
    expect(otherError).not.toHaveBeenCalled();
  });

  it('fails an unavailable run only on its addressed session', () => {
    const h = harness();
    const onError = vi.fn();
    const otherError = vi.fn();
    h.channel.attachAcp('first', { onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(), onRunEnd: vi.fn(), onError });
    h.channel.attachAcp('second', { onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(), onRunEnd: vi.fn(), onError: otherError });
    h.channel.send({
      type: 'acp-run', id: 'first', text: 'summarize',
      snapshot: { kind: 'agent', grants: [], askUser: false },
    });
    expect(onError).toHaveBeenCalledWith('Remote connection unavailable.', true);
    expect(otherError).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
  });

  it('drops an unavailable tool result without a word to any listener', () => {
    const h = harness();
    const listener = {
      onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(),
      onRunEnd: vi.fn(), onActivity: vi.fn(), onClosed: vi.fn(), onError: vi.fn(),
    };
    h.channel.attachAcp('first', listener);
    h.channel.send({ type: 'acp-tool-result', id: 'first', request: 0, output: 'done' });
    for (const spy of Object.values(listener)) expect(spy).not.toHaveBeenCalled();
    expect(h.written).toEqual([]);
    expect(h.errors).toEqual([]);
  });
  function acpHarness() {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    const listener = {
      onReady: vi.fn(), onSessionStarted: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(),
      onRunEnd: vi.fn(), onActivity: vi.fn(), onClosed: vi.fn(), onError: vi.fn(),
    };
    return { ...h, listener };
  }

  it('routes ready, chunk, and run-end frames to the listener that owns the id', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-ready', id: 'racp1', sandboxed: true })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp1', text: 'partial' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-run-end', id: 'racp1', reason: 'answered' })}\n`);

    expect(h.listener.onReady).toHaveBeenCalledTimes(1);
    expect(h.listener.onChunk).toHaveBeenCalledWith('partial');
    expect(h.listener.onRunEnd).toHaveBeenCalledWith('answered');
    expect(h.frames).toEqual([]);
  });

  it('routes the provider id and both ready arguments only to the owning ACP listener', () => {
    const h = acpHarness();
    const other = { ...h.listener, onReady: vi.fn(), onSessionStarted: vi.fn() };
    h.channel.attachAcp('racp1', h.listener);
    h.channel.attachAcp('racp2', other);

    h.channel.receive(`${encodeFrame({ type: 'acp-session-started', id: 'racp1', sessionId: 'provider-abc' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-ready', id: 'racp1', sandboxed: true, sessionId: 'provider-abc' })}\n`);

    expect(h.listener.onSessionStarted).toHaveBeenCalledExactlyOnceWith('provider-abc');
    expect(h.listener.onReady).toHaveBeenCalledExactlyOnceWith(true, 'provider-abc');
    expect(other.onSessionStarted).not.toHaveBeenCalled();
    expect(other.onReady).not.toHaveBeenCalled();
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('delivers an id-bearing frame to no listener for an unknown or detached address', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);
    h.channel.detachAcp('racp1');

    h.channel.receive(`${encodeFrame({ type: 'acp-session-started', id: 'racp1', sessionId: 'stale' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-session-started', id: 'racp9', sessionId: 'unknown' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-ready', id: 'racp9', sandboxed: false, sessionId: 'unknown' })}\n`);

    expect(h.listener.onSessionStarted).not.toHaveBeenCalled();
    expect(h.listener.onReady).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
  });

  it('accepts an ACP listener that omits the optional session-started hook', () => {
    const h = acpHarness();
    const listener = {
      onReady: vi.fn(), onChunk: vi.fn(), onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(),
      onRunEnd: vi.fn(), onActivity: vi.fn(), onClosed: vi.fn(), onError: vi.fn(),
    };
    h.channel.attachAcp('racp1', listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-session-started', id: 'racp1', sessionId: 'provider-abc' })}\n`);

    expect(h.errors).toEqual([]);
  });

  it('routes activity and release acknowledgments to the owning ACP session', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-activity', id: 'racp1', kind: 'thought', text: 'planning' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-closed', id: 'racp1', released: true })}\n`);

    expect(h.listener.onActivity).toHaveBeenCalledWith('thought', 'planning');
    expect(h.listener.onClosed).toHaveBeenCalledWith(true);
    expect(h.frames).toEqual([]);
  });

  // An ACP-level error is not a channel-level fault: `fail` kills the transport, and killing the
  // transport closes the tab. An agent that failed to spawn must not take the whole session with it.
  it('delivers an error frame to the listener without faulting the channel', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-error', id: 'racp1', message: 'gone', fatal: true })}\n`);

    expect(h.listener.onError).toHaveBeenCalledWith('gone', true);
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.channel.attached).toBe(true);
  });

  it('carries the fatal flag through unchanged for a recoverable error', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false })}\n`);

    expect(h.listener.onError).toHaveBeenCalledWith('rate limited', false);
  });

  it('routes turn and run-end frames to the owning ACP session', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-turn', id: 'racp1', phase: 'start', first: true })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-turn', id: 'racp1', phase: 'end', display: 'Done.' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-run-end', id: 'racp1', reason: 'answered' })}\n`);

    expect(h.listener.onTurn).toHaveBeenNthCalledWith(1, { type: 'acp-turn', id: 'racp1', phase: 'start', first: true });
    expect(h.listener.onTurn).toHaveBeenNthCalledWith(2, { type: 'acp-turn', id: 'racp1', phase: 'end', display: 'Done.' });
    expect(h.listener.onRunEnd).toHaveBeenCalledWith('answered');
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('routes a caller tool request to the owning ACP session', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);
    const toolRequest = { type: 'acp-tool-request', id: 'racp1', request: 3, command: 'npm test' } as const;

    h.channel.receive(`${encodeFrame(toolRequest)}\n`);

    expect(h.listener.onToolRequest).toHaveBeenCalledWith(toolRequest);
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it('routes a far-side tool step to the owning ACP session', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);
    const toolStep = { type: 'acp-tool-step', id: 'racp1', command: 'ls', result: 'a.txt', workspace: true } as const;

    h.channel.receive(`${encodeFrame(toolStep)}\n`);

    expect(h.listener.onToolStep).toHaveBeenCalledWith(toolStep);
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  // What makes a chunk still in flight from a session `ask reset` disposed land nowhere instead of
  // in its successor's transcript entry.
  it('drops frames for an id with no attached listener, without faulting the channel', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);
    h.channel.detachAcp('racp1');

    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp1', text: 'stale' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp2', text: 'never attached' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-turn', id: 'racp1', phase: 'start', first: true })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-turn', id: 'racp2', phase: 'end', display: 'never attached' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-run-end', id: 'racp1', reason: 'cancelled' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-tool-request', id: 'racp1', request: 1, command: 'npm test' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-tool-step', id: 'racp2', command: 'ls', result: '', workspace: true })}\n`);

    expect(h.listener.onChunk).not.toHaveBeenCalled();
    expect(h.listener.onTurn).not.toHaveBeenCalled();
    expect(h.listener.onRunEnd).not.toHaveBeenCalled();
    expect(h.listener.onToolRequest).not.toHaveBeenCalled();
    expect(h.listener.onToolStep).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
  });

  it('clears the ACP listeners when the session closes', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.closed();
    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp1', text: 'late' })}\n`);

    expect(h.listener.onChunk).not.toHaveBeenCalled();
  });

  it('still fails the channel on an ACP frame only the local side may send', () => {
    const h = acpHarness();
    h.channel.receive(`${encodeFrame({ type: 'acp-close', id: 'racp1' })}\n`);
    expect(h.errors[0]).toContain('Unexpected remote frame "acp-close"');
  });
});

describe('RemoteChannel — agent snapshot resolution', () => {
  it('sends task and skill lookup to the attached execution host', async () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    const pending = h.channel.resolveAgentSnapshot('ai/tasks/fix.md', ['review']);
    const request = JSON.parse(h.written[0] ?? '{}') as { type: string; id: string; task: string; skills: string[] };
    expect(request).toMatchObject({ type: 'agent-resolve', task: 'ai/tasks/fix.md', skills: ['review'] });

    const snapshot = { taskPath: '/remote/project/ai/tasks/fix.md', taskText: 'Fix it.', skills: [], grants: [] };
    h.channel.receive(`${encodeFrame({ type: 'agent-resolve-result', id: request.id, snapshot })}\n`);

    await expect(pending).resolves.toEqual(snapshot);
  });

  it('forwards a selected workspace through the facade', async () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    const pending = h.channel.resolveAgentSnapshot('ai/tasks/fix.md', ['review'], 'agent-run1');
    const request = JSON.parse(h.written[0] ?? '{}') as { type: string; id: string; workspace?: string };
    expect(request).toMatchObject({ type: 'agent-resolve', workspace: 'agent-run1' });

    const snapshot = { taskPath: '/remote/clone/ai/tasks/fix.md', taskText: 'Fix it.', skills: [], grants: [] };
    h.channel.receive(`${encodeFrame({ type: 'agent-resolve-result', id: request.id, snapshot })}\n`);

    await expect(pending).resolves.toEqual(snapshot);
  });

  it('leaves the frame unchanged through the facade when no workspace is selected', () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    void h.channel.resolveAgentSnapshot('ai/tasks/fix.md', ['review']);
    const request = JSON.parse(h.written[0] ?? '{}') as { workspace?: string };
    expect(request).not.toHaveProperty('workspace');
  });

  it.each(['authentication', 'closed', 'reconnecting', 'attaching'] as const)(
    'rejects a selected resolution with no write while %s', async (state) => {
      const h = harness();
      if (state !== 'authentication') {
        if (state === 'reconnecting') {
          h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
          h.channel.receive(`${encodeHandshake(h.channel.sessionId)}\n`);
          h.channel.closed();
        } else if (state === 'attaching') {
          h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
          h.channel.receive(`${encodeHandshake(h.channel.sessionId)}\n`);
        } else {
          h.channel.closed();
        }
      }
      expect(h.channel.attached).toBe(false);

      await expect(h.channel.resolveAgentSnapshot('ai/tasks/fix.md', [], 'agent-run1'))
        .rejects.toThrow('Remote connection unavailable.');
      expect(h.written).toEqual([]);
    },
  );
});

describe('RemoteChannel — run clones', () => {
  type CloneFrame = { type: 'run-clone'; id: string; action: string; label: string };

  function attached() {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    return h;
  }

  function request(written: string[]): CloneFrame {
    const frame = JSON.parse(written.at(-1) ?? '{}') as CloneFrame;
    if (frame.type !== 'run-clone') throw new Error('Expected an encoded run-clone request.');
    return frame;
  }

  function answer(h: ReturnType<typeof harness>, id: string, result: Record<string, unknown> = {}) {
    h.channel.receive(`${encodeFrame({ type: 'run-clone-result', id, ...result })}\n`);
  }

  it('writes one encoded frame per call and routes the result to its request without a notification', async () => {
    const h = attached();
    const create = h.channel.runClone('create', 'subagent-run1');
    const release = h.channel.runClone('release', 'subagent-run1');
    const frames = h.written.map((line) => request([line]));
    expect(frames).toMatchObject([
      { type: 'run-clone', action: 'create', label: 'subagent-run1' },
      { type: 'run-clone', action: 'release', label: 'subagent-run1' },
    ]);
    expect(frames[0]!.id).not.toBe(frames[1]!.id);

    answer(h, frames[1]!.id);
    answer(h, frames[0]!.id, { dir: '/srv/ws/subagent-run1' });

    await expect(create).resolves.toBe('/srv/ws/subagent-run1');
    await expect(release).resolves.toBeUndefined();
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
  });

  it.each(['authentication', 'closed', 'reconnecting', 'attaching'] as const)(
    'rejects a call with no write while %s', async (state) => {
      const h = harness();
      if (state !== 'authentication') {
        if (state === 'reconnecting') {
          h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
          h.channel.receive(`${encodeHandshake(h.channel.sessionId)}\n`);
          h.channel.closed();
        } else if (state === 'attaching') {
          h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
          h.channel.receive(`${encodeHandshake(h.channel.sessionId)}\n`);
        } else {
          h.channel.closed();
        }
      }
      expect(h.channel.attached).toBe(false);

      await expect(h.channel.runClone('create', 'run1')).rejects.toThrow('Remote connection unavailable.');
      expect(h.written).toEqual([]);
    },
  );

  it('settles a pending create and release on disconnect', async () => {
    const h = attached();
    const create = h.channel.runClone('create', 'run-a');
    const release = h.channel.runClone('release', 'run-b');

    h.channel.disconnect();

    await expect(create).rejects.toThrow('Remote session detached.');
    await expect(release).rejects.toThrow('Remote session detached.');
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('settles a pending create on finish even when the shutdown write throws', async () => {
    const h = harness((data) => {
      if (data.includes('"type":"shutdown"')) throw new Error('shutdown write refused');
    });
    h.channel.receive(`${encodeHandshake()}\n`);
    const pending = h.channel.runClone('create', 'run1');
    const expectation = expect(pending).rejects.toThrow('Remote session ended.');

    expect(() => h.channel.finish()).toThrow('shutdown write refused');
    await expectation;
  });

  it.each([true, false] as const)('settles pending requests on transport loss with session id: %s', async (withSession) => {
    const h = harness();
    if (withSession) h.channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
    else h.channel.receive(`${encodeHandshake()}\n`);
    const create = h.channel.runClone('create', 'run-a');
    const release = h.channel.runClone('release', 'run-b');
    const expectation = Promise.all([
      expect(create).rejects.toThrow('Remote connection lost.'),
      expect(release).rejects.toThrow('Remote connection lost.'),
    ]);

    h.channel.closed();

    await expectation;
  });

  it('settles pending requests immediately on a direct close', async () => {
    const h = attached();
    const pending = h.channel.runClone('create', 'run1');
    const expectation = expect(pending).rejects.toThrow('Remote connection lost.');

    h.channel.close();

    await expectation;
    expect(h.kill).toHaveBeenCalledOnce();
  });

  it('settles pending requests on a malformed clone result without a later closed callback', async () => {
    const h = attached();
    const pending = h.channel.runClone('create', 'run1');
    const id = request(h.written).id;
    const expectation = expect(pending).rejects.toThrow('Malformed remote frame "run-clone-result".');

    h.channel.receive(`${JSON.stringify({ type: 'run-clone-result', id, dir: '', error: 'both' })}\n`);

    await expectation;
    expect(h.errors).toEqual(['Malformed remote frame "run-clone-result".']);
    expect(h.kill).toHaveBeenCalledOnce();
    expect(h.closes).not.toHaveBeenCalled();
  });

  it('rejects a request whose write throws without waiting for a PTY exit', async () => {
    const h = harness(() => { throw new Error('write refused'); });
    h.channel.receive(`${encodeHandshake()}\n`);

    await expect(h.channel.runClone('create', 'run1')).rejects.toThrow('write refused');
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.errors).toEqual([]);
  });

  it('does not resend an old request after a reconnect and lets a fresh call succeed', async () => {
    const h = attached();
    const old = h.channel.runClone('create', 'run-old');
    const oldExpectation = expect(old).rejects.toThrow('Remote connection lost.');
    h.channel.closed();
    await oldExpectation;
    expect(h.written).toHaveLength(1);

    const transport = { id: 'new', write: (data: string) => { h.written.push(data); }, kill: vi.fn() };
    h.channel.replaceTransport(transport);
    h.channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
    h.channel.receive(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
    expect(h.channel.attached).toBe(true);
    expect(h.written).toHaveLength(1);

    const fresh = h.channel.runClone('create', 'run-new');
    const id = request(h.written.slice(1)).id;
    answer(h, id, { dir: '/srv/ws/run-new' });
    await expect(fresh).resolves.toBe('/srv/ws/run-new');
    expect(request(h.written.slice(1))).toMatchObject({ action: 'create', label: 'run-new' });
  });

  it('keeps navigator reply and event routing through the extracted dispatcher', () => {
    const h = attached();
    const onReply = vi.fn();
    const onEvent = vi.fn();
    h.channel.attachNavigator('files1', { onReply, onEvent });
    h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'files1', request: 'q1', result: [] })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'filesystem-event', session: 'files1', path: 'src' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'unknown', request: 'q2', error: 'gone' })}\n`);

    expect(onReply).toHaveBeenCalledExactlyOnceWith({ type: 'filesystem-reply', session: 'files1', request: 'q1', result: [] });
    expect(onEvent).toHaveBeenCalledExactlyOnceWith('src');
    expect(h.frames).toEqual([]);
    expect(h.errors).toEqual([]);
    expect(h.kill).not.toHaveBeenCalled();
  });

  it('fails the channel on a client-only run-clone and settles its pending request', async () => {
    const h = attached();
    const pending = h.channel.runClone('create', 'run1');
    const expectation = expect(pending).rejects.toThrow('Unexpected remote frame "run-clone".');

    h.channel.receive(`${encodeFrame({ type: 'run-clone', id: 'far', action: 'create', label: 'run1' })}\n`);

    await expectation;
    expect(h.errors).toEqual(['Unexpected remote frame "run-clone".']);
    expect(h.kill).toHaveBeenCalledOnce();
  });
});

describe('RemoteChannel — closing', () => {
  it('notifies and clears attached navigators', () => {
    const h = harness();
    const onClose = vi.fn();
    const onReply = vi.fn();
    h.channel.attachNavigator('files1', { onReply, onEvent: vi.fn(), onClose });
    h.channel.closed();
    expect(onClose).toHaveBeenCalledOnce();
    h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'files1', request: 'q1', result: [] })}\n`);
    expect(onReply).not.toHaveBeenCalled();
  });

  it('notifies the owner exactly once however many times it is told', () => {
    const h = harness();
    h.channel.closed();
    h.channel.closed();
    expect(h.closes).toHaveBeenCalledTimes(1);
  });

  it('ignores bytes arriving after the session ended', () => {
    const h = harness();
    h.channel.closed();
    h.channel.receive('late output');
    expect(h.terminal).toEqual([]);
  });

  it('kills the transport when asked to close', () => {
    const h = harness();
    h.channel.close();
    expect(h.kill).toHaveBeenCalled();
  });
});

describe('RemoteChannel — final close cleanup', () => {
  it.each(['close', 'disconnect', 'finish', 'fail', 'closed'] as const)(
    'calls onFinalClose exactly once on %s', (phase) => {
      const h = harness();
      if (phase === 'fail') h.channel.receive(`${encodeHandshake()}\n`);
      switch (phase) {
      case 'close': { h.channel.close(); break; }
      case 'disconnect': { h.channel.disconnect(); break; }
      case 'finish': { h.channel.finish(); break; }
      case 'fail': { h.channel.receive(`${JSON.stringify({ type: 'exec', id: 'r1' })}\n`); break; }
      case 'closed': { h.channel.closed(); break; }
      }
      expect(h.finalClose).toHaveBeenCalledOnce();
    },
  );

  it('does not call onFinalClose when closed with a session id', () => {
    const h = harness();
    h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
    h.channel.closed();
    expect(h.finalClose).not.toHaveBeenCalled();
  });

  it('does not call onFinalClose when the transport is replaced', () => {
    const h = harness();
    h.channel.replaceTransport({ id: 'new', write: vi.fn(), kill: vi.fn() });
    expect(h.finalClose).not.toHaveBeenCalled();
  });
});

it('preserves process and navigator routing but detaches ACP on a dropped peer transport', () => {
  const h = harness();
  h.channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
  const onOutput = vi.fn(), onReply = vi.fn(), onChunk = vi.fn(), onClose = vi.fn();
  h.channel.attach('p', { onOutput, onExit: vi.fn() });
  h.channel.attachNavigator('n', { onReply, onEvent: vi.fn(), onClose });
  h.channel.attachAcp('a', {
    onReady: vi.fn(), onChunk, onTurn: vi.fn(), onToolRequest: vi.fn(), onToolStep: vi.fn(),
    onRunEnd: vi.fn(), onError: vi.fn(),
  });
  h.channel.closed(); expect(onClose).not.toHaveBeenCalled();
  h.channel.replaceTransport({ id: 'new', write: vi.fn(), kill: vi.fn() });
  h.channel.receive(`${encodeHandshake()}\n`);
  expect(h.channel.attached).toBe(false);
  h.channel.receive(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
  expect(h.channel.attached).toBe(true);
  h.channel.receive(`${encodeFrame({ type: 'output', id: 'p', data: 'still running' })}\n`);
  h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'n', request: 'q', result: [] })}\n`);
  h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'a', text: 'same agent' })}\n`);
  expect(onOutput).toHaveBeenCalledWith('still running');
  expect(onReply).toHaveBeenCalledOnce(); expect(onChunk).not.toHaveBeenCalled();
});
it('settles a capture-request made while still authenticating with an error, rather than hanging', async () => {
  const h = harness();
  const pending = h.channel.requestCapture('p1', 's1');
  await expect(pending).resolves.toEqual({ error: 'Remote connection unavailable.' });
  expect(h.written).toEqual([]);
});

it('answers new filesystem requests during a disconnect without sending or replaying them', () => {
  const h = harness();
  h.channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
  const reply = vi.fn();
  h.channel.attachNavigator('n', { onReply: reply, onEvent: vi.fn() });
  h.channel.closed();
  h.channel.send({ type: 'filesystem-request', session: 'n', request: 'q', operation: 'read-directory', args: {} });
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ request: 'q', error: 'Remote connection unavailable.' }));
  expect(h.written).toEqual([]);
});

// A session attached after janissary restarted has no tabs at all when the far side's replay burst
// arrives: the peer flushes everything the instant it accepts the attach, and the tabs are built
// from the answer that follows. Dropping what has no listener would lose every attached process's
// first words.
describe('RemoteChannel — frames for an id with no listener yet', () => {
  function attachedChannel() {
    const h = harness();
    // As a resume does: the session id is set before the handshake, so the channel enters its
    // attaching window and the state that opens the hold.
    h.channel.sessionId = '12345678-1234-1234-1234-123456789abc';
    h.channel.receive(`${encodeHandshake('12345678-1234-1234-1234-123456789abc')}\n`);
    return h;
  }

  it('holds output until a listener attaches, then delivers it in arrival order', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'first' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'second' })}\n`);

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual(['first', 'second']);
  });

  it('holds an exit for an id it never spawned and delivers it on attach', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'exit', id: 'r1', exitCode: 3 })}\n`);

    const onExit = vi.fn();
    h.channel.attach('r1', { onOutput: vi.fn(), onExit });
    expect(onExit).toHaveBeenCalledWith(3);
  });

  it('delivers output and the exit that ends it in the order the far side produced them', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'bye' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'exit', id: 'r1', exitCode: 0 })}\n`);

    const events: string[] = [];
    h.channel.attach('r1', {
      onOutput: (d) => { events.push(`out:${d}`); },
      onExit: (code) => { events.push(`exit:${code}`); },
    });
    expect(events).toEqual(['out:bye', 'exit:0']);
  });

  it('holds each id separately, so one attach claims only its own frames', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'one' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r2', data: 'two' })}\n`);

    const first: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { first.push(d); }, onExit: vi.fn() });
    expect(first).toEqual(['one']);

    const second: string[] = [];
    h.channel.attach('r2', { onOutput: (d) => { second.push(d); }, onExit: vi.fn() });
    expect(second).toEqual(['two']);
  });

  it('leaves a listener that is already attached on the live path, holding nothing', () => {
    const h = attachedChannel();
    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'live' })}\n`);
    expect(chunks).toEqual(['live']);
    expect(h.truncated).not.toHaveBeenCalled();
  });

  it('reports truncation once when the buffer overflows its budget', () => {
    const h = attachedChannel();
    const chunk = 'x'.repeat(200_000);
    for (let index = 0; index < 8; index++) {
      h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: chunk })}\n`);
    }

    h.channel.attach('r1', { onOutput: vi.fn(), onExit: vi.fn() });
    expect(h.truncated).toHaveBeenCalledTimes(1);

    h.channel.attach('r2', { onOutput: vi.fn(), onExit: vi.fn() });
    expect(h.truncated).toHaveBeenCalledTimes(1);
  });

  // A peer may describe a process this side chose not to restore — a navigator's, or one whose tab
  // the user closed meanwhile. Its replay must not sit in memory for the life of the channel.
  it('discards what no tab claimed once the attach has built its tabs', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r9', data: 'orphan' })}\n`);
    h.channel.discardUnclaimed();

    const chunks: string[] = [];
    h.channel.attach('r9', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
  });

  it('drops what it is holding when the channel ends for good', () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'held' })}\n`);
    h.channel.closed();

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
  });

  // A transport lost by a session that can be attached is not the end of anything: the peer is
  // still there and the frames it already sent are still owed to whichever tab claims them.
  it('holds what it is holding across a transport loss that will reconnect', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'held' })}\n`);
    h.channel.closed();

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual(['held']);
  });

  // A channel that is not attaching has nothing to hold for: a frame whose listener is gone (a
  // closed tab whose far side is still writing before its kill lands) stays dropped, and no
  // truncated-replay line is raised into a tab that was never disconnected.
  it('drops an unlistened frame on a live channel with no attach in flight', () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake()}\n`);
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'late' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'exit', id: 'r9', exitCode: 1 })}\n`);

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
    expect(h.truncated).not.toHaveBeenCalled();
  });

  // The window brackets the whole attach, and once it closes the channel is ordinary again:
  // nothing arriving afterwards is held for an id nobody claims.
  it('stops holding once the attach window closes', () => {
    const h = attachedChannel();
    h.channel.discardUnclaimed();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'late' })}\n`);

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
    expect(h.truncated).not.toHaveBeenCalled();
  });
});
