import { describe, it, expect, vi } from 'vitest';
import { createRemoteShell } from './shell-session.js';
import { RemoteChannel, type ChannelTransport } from './channel.js';
import { encodeFrame, encodeHandshake, decodeFrame, type RemoteFrame } from './protocol.js';
import { executeShellCmd, queryShellPwd } from '../shell.js';

// An attached channel over a fake ssh PTY, plus a helper to answer as the remote shell would.
function attachedChannel() {
  const sent: RemoteFrame[] = [];
  const transport: ChannelTransport = {
    id: 'pty1',
    write: (data) => {
      for (const line of data.split('\n')) {
        if (!line) continue;
        const frame = decodeFrame(line);
        if (!('error' in frame)) sent.push(frame);
      }
    },
    kill: vi.fn(),
  };
  const channel = new RemoteChannel(transport, {
    onTerminalData: vi.fn(), onAttached: vi.fn(), onFrame: vi.fn(), onError: vi.fn(), onClose: vi.fn(),
  });
  channel.receive(`${encodeHandshake('/srv/proj')}\n`);
  const reply = (id: string, data: string) => { channel.receive(`${encodeFrame({ type: 'output', id, data })}\n`); };
  return { channel, sent, reply };
}

// Everything the local side wrote to the remote shell's stdin, concatenated.
function writtenInput(sent: RemoteFrame[]): string {
  return sent.filter((f) => f.type === 'input').map((f) => f.data).join('');
}

// The sentinel `executeShellCmd` appends, lifted back out of what it actually wrote.
function sentinelFrom(input: string): string {
  return /__JS_END_\d+_\d+__/.exec(input)?.[0] ?? '';
}

describe('createRemoteShell', () => {
  it('spawns the remote shell in pipe mode, not as a pty', () => {
    const { channel, sent } = attachedChannel();
    createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    expect(sent).toEqual([
      { type: 'spawn', id: 'rsh1', program: 'bash', command: 'bash', mode: 'pipe', cols: 80, rows: 24 },
    ]);
  });

  it('presents a writable stdin and non-emitting stderr', () => {
    const { channel } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    expect(shell.stdin?.writable).toBe(true);
    const onStderr = vi.fn();
    shell.stderr?.on('data', onStderr);
    expect(onStderr).not.toHaveBeenCalled();
  });

  // This is the test that proves no exec frame family is needed: the real `executeShellCmd` drives
  // the adapter end to end, unchanged.
  it('runs a command through the real executeShellCmd, reassembling output split across frames', () => {
    const { channel, sent, reply } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    const chunks: string[] = [];
    const done = vi.fn();

    executeShellCmd(shell, 'ls -la', 7, (buffer) => { chunks.push(buffer); }, done);

    const input = writtenInput(sent);
    expect(input).toContain('ls -la 2>&1\n');
    const sentinel = sentinelFrom(input);

    reply('rsh1', 'total 8\n');
    reply('rsh1', 'drwxr-xr-x  src\n');
    reply('rsh1', `${sentinel}\n`);

    expect(chunks).toEqual(['total 8\n', 'total 8\ndrwxr-xr-x  src\n']);
    expect(done).toHaveBeenCalledWith('total 8\ndrwxr-xr-x  src');
  });

  it('completes a command whose whole output and sentinel arrive in one frame', () => {
    const { channel, sent, reply } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    const done = vi.fn();

    executeShellCmd(shell, 'echo hi', 1, vi.fn(), done);
    const sentinel = sentinelFrom(writtenInput(sent));
    reply('rsh1', `hi\n${sentinel}\n`);

    expect(done).toHaveBeenCalledWith('hi');
  });

  it('gets the remote working directory back through queryShellPwd', () => {
    const { channel, sent, reply } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    const onResult = vi.fn();

    queryShellPwd(shell, 3, onResult);

    const input = writtenInput(sent);
    expect(input).toContain('pwd\n');
    const sentinel = /__PWD_\d+_\d+__/.exec(input)?.[0] ?? '';
    reply('rsh1', `/srv/proj/.janissary/workspace/bekir\n${sentinel}\n`);

    expect(onResult).toHaveBeenCalledWith('/srv/proj/.janissary/workspace/bekir');
  });

  it('sends a kill frame and reports the kill only once', () => {
    const { channel, sent } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    sent.length = 0;

    expect(shell.kill()).toBe(true);
    expect(sent).toEqual([{ type: 'kill', id: 'rsh1' }]);
    expect(shell.kill()).toBe(false);
  });

  it('marks stdin unwritable once the remote shell exits, so the caller respawns', () => {
    const { channel } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash');
    channel.receive(`${encodeFrame({ type: 'exit', id: 'rsh1', exitCode: 0 })}\n`);
    expect(shell.stdin?.writable).toBe(false);
  });
});
