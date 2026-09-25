import { describe, it, expect, vi } from 'vitest';
import { createRemoteShell } from './shell-session.js';
import { RemoteChannel, type ChannelTransport } from './channel.js';
import { encodeFrame, encodeHandshake, decodeFrame, type RemoteFrame, type ShellHistoryRun } from './protocol.js';
import { executeShellCmd, queryShellPwd } from '../shell/index.js';

// An attached channel over a fake ssh PTY, plus a helper to answer as the remote shell would.
function attachedChannel(session?: string) {
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
  channel.sessionId = session;
  channel.receive(`${encodeHandshake()}\n`);
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

  it('attaches to an adopted shell without spawning it again', () => {
    const { channel, sent } = attachedChannel();
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash', 'bekir', true);

    expect(sent).toEqual([]);
    shell.stdin?.write('echo retained\n');
    expect(sent).toEqual([{ type: 'input', id: 'rsh1', data: 'echo retained\n' }]);
  });

  it('reports replayed output while an adopted shell claims it', () => {
    const { channel } = attachedChannel('session');
    channel.receive(`${encodeFrame({ type: 'output', id: 'rsh1', data: 'retained output' })}\n`);
    const restored = { output: vi.fn(), history: vi.fn() };

    createRemoteShell(channel, 'rsh1', 'bash', 'bash', 'bekir', true, restored);

    expect(restored.output).toHaveBeenCalledWith('retained output');
    expect(restored.history).not.toHaveBeenCalled();
  });

  it('reports retained history runs to an adopted shell and never onto its stream', () => {
    const { channel } = attachedChannel('session');
    const runs: ShellHistoryRun[] = [
      { source: 'input', text: '{ :; ls\n} 2>&1; echo "__JS_END_3_9__"\n' },
      { source: 'output', text: 'src\n__JS_END_3_9__\n' },
    ];
    channel.receive(`${encodeFrame({ type: 'shell-history', id: 'rsh1', runs })}\n`);
    const restored = { output: vi.fn(), history: vi.fn() };

    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash', 'bekir', true, restored);
    const onData = vi.fn();
    shell.stdout?.on('data', onData);
    channel.receive(`${encodeFrame({ type: 'shell-history', id: 'rsh1', runs })}\n`);

    expect(restored.history).toHaveBeenCalledTimes(2);
    expect(restored.history).toHaveBeenLastCalledWith(runs);
    expect(onData).not.toHaveBeenCalled();
    expect(restored.output).not.toHaveBeenCalled();
  });

  it('keeps restored history out of the next command and records only idle output', async () => {
    const { channel, sent, reply } = attachedChannel('session');
    channel.receive(`${encodeFrame({ type: 'attach-result', accepted: true })}\n`);
    reply('rsh1', 'earlier output\n');
    const restored = { output: vi.fn(), history: vi.fn() };
    const shell = createRemoteShell(channel, 'rsh1', 'bash', 'bash', 'bekir', true, restored);
    const done = vi.fn();

    executeShellCmd(shell, 'echo fresh', 7, vi.fn(), done);
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    reply('rsh1', `fresh\n${sentinelFrom(writtenInput(sent))}\n`);

    expect(done).toHaveBeenCalledExactlyOnceWith('fresh');
    expect(restored.output).toHaveBeenCalledExactlyOnceWith('earlier output\n');

    const pwd = vi.fn();
    queryShellPwd(shell, 7, pwd);
    const sentinel = /__PWD_\d+_\d+__/.exec(writtenInput(sent))![0];
    reply('rsh1', `/remote/work\n${sentinel}\n`);
    expect(pwd).toHaveBeenCalledExactlyOnceWith('/remote/work');
    expect(restored.output).toHaveBeenCalledTimes(1);

    reply('rsh1', 'background output\n');
    expect(restored.output).toHaveBeenLastCalledWith('background output\n');
    shell.kill();
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
    expect(input).toContain('{ :; ls -la\n} 2>&1;');
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
