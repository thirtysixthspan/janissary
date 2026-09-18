import { describe, it, expect, vi } from 'vitest';
import { RemoteChannel, type ChannelTransport, type ChannelFrame } from './channel.js';
import { encodeFrame, encodeHandshake, HANDSHAKE_SENTINEL, REMOTE_PROTOCOL_VERSION } from './protocol.js';

function harness() {
  const written: string[] = [];
  const kill = vi.fn();
  const transport: ChannelTransport = { id: 'pty1', write: (d) => { written.push(d); }, kill };
  const terminal: string[] = [];
  const frames: ChannelFrame[] = [];
  const errors: string[] = [];
  const closes = vi.fn();
  const attached = vi.fn();
  const truncated = vi.fn();
  const channel = new RemoteChannel(transport, {
    onTerminalData: (d) => { terminal.push(d); },
    onAttached: attached,
    onFrame: (f) => { frames.push(f); },
    onError: (m) => { errors.push(m); },
    onClose: closes,
    onTruncatedReplay: truncated,
  });
  return { channel, written, terminal, frames, errors, closes, attached, truncated, kill };
}

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
  it('flips to attached, reports the resolved root, and stops echoing to the terminal', () => {
    const h = harness();
    h.channel.receive(`motd\n${encodeHandshake('/srv/proj')}\n`);
    expect(h.terminal).toEqual(['motd\n']);
    expect(h.channel.attached).toBe(true);
    expect(h.attached).toHaveBeenCalledWith({ version: REMOTE_PROTOCOL_VERSION, root: '/srv/proj' });

    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'x' })}\n`);
    expect(h.terminal).toEqual(['motd\n']);
  });

  it('holds the sentinel back until its line is complete', () => {
    const h = harness();
    const line = encodeHandshake('/srv/proj');
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
    h.channel.receive(`${encodeHandshake('/srv/proj')}\n`);
    return h;
  }

  it('writes one newline-terminated frame per send', () => {
    const h = attachedChannel();
    h.channel.send({ type: 'provision', label: 'claude' });
    expect(h.written).toEqual([`${encodeFrame({ type: 'provision', label: 'claude' })}\n`]);
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
});

describe('RemoteChannel — ACP session routing', () => {
  function acpHarness() {
    const h = harness();
    h.channel.receive(`${encodeHandshake('/srv/proj')}\n`);
    const listener = { onReady: vi.fn(), onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    return { ...h, listener };
  }

  it('routes ready, chunk, and end frames to the listener that owns the id', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);

    h.channel.receive(`${encodeFrame({ type: 'acp-ready', id: 'racp1' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp1', text: 'partial' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-end', id: 'racp1', stopReason: 'end_turn' })}\n`);

    expect(h.listener.onReady).toHaveBeenCalledTimes(1);
    expect(h.listener.onChunk).toHaveBeenCalledWith('partial');
    expect(h.listener.onEnd).toHaveBeenCalledWith('end_turn');
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

  // What makes a chunk still in flight from a session `acp reset` disposed land nowhere instead of
  // in its successor's transcript entry.
  it('drops frames for an id with no attached listener, without faulting the channel', () => {
    const h = acpHarness();
    h.channel.attachAcp('racp1', h.listener);
    h.channel.detachAcp('racp1');

    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp1', text: 'stale' })}\n`);
    h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'racp2', text: 'never attached' })}\n`);

    expect(h.listener.onChunk).not.toHaveBeenCalled();
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
it('preserves all session routing while replacing a dropped peer transport', () => {
  const h = harness();
  h.channel.receive(`${encodeHandshake('/remote', '12345678-1234-1234-1234-123456789abc')}\n`);
  const onOutput = vi.fn(), onReply = vi.fn(), onChunk = vi.fn(), onClose = vi.fn();
  h.channel.attach('p', { onOutput, onExit: vi.fn() });
  h.channel.attachNavigator('n', { onReply, onEvent: vi.fn(), onClose });
  h.channel.attachAcp('a', { onReady: vi.fn(), onChunk, onEnd: vi.fn(), onError: vi.fn() });
  h.channel.closed(); expect(onClose).not.toHaveBeenCalled();
  h.channel.replaceTransport({ id: 'new', write: vi.fn(), kill: vi.fn() });
  h.channel.receive(`${encodeHandshake('/remote')}\n`);
  expect(h.channel.attached).toBe(false);
  h.channel.receive(`${encodeFrame({ type: 'reattach-result', accepted: true })}\n`);
  expect(h.channel.attached).toBe(true);
  h.channel.receive(`${encodeFrame({ type: 'output', id: 'p', data: 'still running' })}\n`);
  h.channel.receive(`${encodeFrame({ type: 'filesystem-reply', session: 'n', request: 'q', result: [] })}\n`);
  h.channel.receive(`${encodeFrame({ type: 'acp-chunk', id: 'a', text: 'same agent' })}\n`);
  expect(onOutput).toHaveBeenCalledWith('still running');
  expect(onReply).toHaveBeenCalledOnce(); expect(onChunk).toHaveBeenCalledWith('same agent');
});
it('answers new filesystem requests during a disconnect without sending or replaying them', () => {
  const h = harness();
  h.channel.receive(`${encodeHandshake('/remote', '12345678-1234-1234-1234-123456789abc')}\n`);
  const reply = vi.fn();
  h.channel.attachNavigator('n', { onReply: reply, onEvent: vi.fn() });
  h.channel.closed();
  h.channel.send({ type: 'filesystem-request', session: 'n', request: 'q', operation: 'read-directory', args: {} });
  expect(reply).toHaveBeenCalledWith(expect.objectContaining({ request: 'q', error: 'Remote connection unavailable.' }));
  expect(h.written).toEqual([]);
});

// A session reattached after janissary restarted has no tabs at all when the far side's replay burst
// arrives: the peer flushes everything the instant it accepts the reattach, and the tabs are built
// from the answer that follows. Dropping what has no listener would lose every reattached process's
// first words.
describe('RemoteChannel — frames for an id with no listener yet', () => {
  function attachedChannel() {
    const h = harness();
    h.channel.receive(`${encodeHandshake('/srv/proj', '12345678-1234-1234-1234-123456789abc')}\n`);
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
  it('discards what no tab claimed once the reattach has built its tabs', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r9', data: 'orphan' })}\n`);
    h.channel.discardUnclaimed();

    const chunks: string[] = [];
    h.channel.attach('r9', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
  });

  it('drops what it is holding when the channel ends for good', () => {
    const h = harness();
    h.channel.receive(`${encodeHandshake('/srv/proj')}\n`);
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'held' })}\n`);
    h.channel.closed();

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual([]);
  });

  // A transport lost by a session that can be reattached is not the end of anything: the peer is
  // still there and the frames it already sent are still owed to whichever tab claims them.
  it('keeps what it is holding across a transport loss that will reconnect', () => {
    const h = attachedChannel();
    h.channel.receive(`${encodeFrame({ type: 'output', id: 'r1', data: 'held' })}\n`);
    h.channel.closed();

    const chunks: string[] = [];
    h.channel.attach('r1', { onOutput: (d) => { chunks.push(d); }, onExit: vi.fn() });
    expect(chunks).toEqual(['held']);
  });
});
