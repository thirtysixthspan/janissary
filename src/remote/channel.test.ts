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
  const channel = new RemoteChannel(transport, {
    onTerminalData: (d) => { terminal.push(d); },
    onAttached: attached,
    onFrame: (f) => { frames.push(f); },
    onError: (m) => { errors.push(m); },
    onClose: closes,
  });
  return { channel, written, terminal, frames, errors, closes, attached, kill };
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
