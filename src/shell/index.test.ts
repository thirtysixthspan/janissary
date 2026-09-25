import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

function mockStream() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    setEncoding: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      const hs = handlers.get(event);
      if (hs) for (const h of hs) h(...args);
    },
  };
}

function mockChildProcess(): ChildProcess {
  const stdout = mockStream();
  const stderr = mockStream();
  const stdin = {
    writable: true,
    write: vi.fn(),
    on: vi.fn(),
    emit() {},
  };
  return { stdout, stderr, stdin, killed: false, kill: vi.fn(), exitCode: null, signalCode: null } as unknown as ChildProcess;
}

const mockSpawn = vi.hoisted(() => vi.fn(() => mockChildProcess()));
vi.mock('node:child_process', () => ({ spawn: mockSpawn }));
vi.mock('./sandbox/index.js', () => ({
  sandboxSpawn: vi.fn((_options, command, args, env) => ({ command, args, env })),
}));

import { spawnShell, executeShellCmd, killShellGroup, queryShellPwd, SHELL_EXITED_NOTE } from './index.js';
import { shellCommandInput } from './command-input.js';
import { shellStartupArgs } from './startup.js';

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue(mockChildProcess());
});

describe('spawnShell', () => {
  it('spawns a shell via sandboxSpawn', () => {
    spawnShell(0);
    expect(mockSpawn).toHaveBeenCalledOnce();
    const call = mockSpawn.mock.calls[0];
    expect(call[0]).toBe(process.env.SHELL || 'bash');
    expect(call[1]).toEqual(shellStartupArgs(process.env.SHELL || 'bash'));
    expect(call[2]).toMatchObject({ stdio: ['pipe', 'pipe', 'pipe'] });
  });

  it('passes zsh the startup flags zsh accepts', () => {
    const previousShell = process.env.SHELL;
    process.env.SHELL = '/bin/zsh';
    try {
      spawnShell(0);
      const call = mockSpawn.mock.calls[0];
      expect(call[0]).toBe('/bin/zsh');
      expect(call[1]).toEqual(['--no-rcs']);
    } finally {
      if (previousShell === undefined) delete process.env.SHELL; else process.env.SHELL = previousShell;
    }
  });

  it('merges extraEnvironment into env', () => {
    spawnShell(0, { FOO: 'bar' });
    const env = mockSpawn.mock.calls[0][2].env;
    expect(env.FOO).toBe('bar');
  });

  it('sets encoding on stdout and stderr', () => {
    const proc = spawnShell(0);
    expect(proc.stdout.setEncoding).toHaveBeenCalledWith('utf8');
    expect(proc.stderr.setEncoding).toHaveBeenCalledWith('utf8');
  });

  it('leaves the shell in the caller\'s process group by default', () => {
    spawnShell(0);
    expect(mockSpawn.mock.calls[0][2].detached).toBeUndefined();
  });

  it('gives the shell a process group of its own when asked to detach', () => {
    spawnShell(0, undefined, undefined, { detached: true });
    expect(mockSpawn.mock.calls[0][2].detached).toBe(true);
  });
});

// A detached shell leads a group nothing else will clean up, so ending it has to end the group or
// the command it was running is left behind.
describe('killShellGroup', () => {
  it('signals the whole process group the shell leads', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const shell = { pid: 4242, kill: vi.fn() } as unknown as ChildProcess;
    try {
      killShellGroup(shell);
      expect(kill).toHaveBeenCalledWith(-4242, 'SIGTERM');
      expect(shell.kill).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  });

  it('falls back to the shell alone when the group signal cannot be delivered', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    const shell = { pid: 4242, kill: vi.fn() } as unknown as ChildProcess;
    try {
      killShellGroup(shell);
      expect(shell.kill).toHaveBeenCalledOnce();
    } finally {
      kill.mockRestore();
    }
  });

  it('falls back to the shell alone when it never got a pid', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const shell = { pid: undefined, kill: vi.fn() } as unknown as ChildProcess;
    try {
      killShellGroup(shell);
      expect(kill).not.toHaveBeenCalled();
      expect(shell.kill).toHaveBeenCalledOnce();
    } finally {
      kill.mockRestore();
    }
  });
});

describe('shellCommandInput', () => {
  it('leaves nothing after the command for the command itself to read', () => {
    const input = shellCommandInput('read -r LINE', '__JS_END_1_1000__');

    const lines = input.split('\n');
    expect(lines[0]).toBe('{ :; read -r LINE');
    expect(lines[1]).toBe('} 2>&1; echo "__JS_END_1_1000__"');
    expect(lines[2]).toBe('');
  });

  it('still ends in the delimiter when the command is empty', () => {
    const input = shellCommandInput('', '__JS_END_1_1000__');

    expect(input).toBe('{ :; \n} 2>&1; echo "__JS_END_1_1000__"\n');
  });

  it('still ends in the delimiter when the command is only a comment', () => {
    const input = shellCommandInput('# nothing to do', '__JS_END_1_1000__');

    expect(input).toBe('{ :; # nothing to do\n} 2>&1; echo "__JS_END_1_1000__"\n');
  });
});

describe('executeShellCmd', () => {
  it('calls onProgress with partial output', () => {
    const shell = mockChildProcess();
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    executeShellCmd(shell, 'ls', 1, onProgress, onComplete);

    shell.stdout.emit('data', 'file1.txt\n');
    expect(onProgress).toHaveBeenCalledWith('file1.txt\n');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onComplete when the prompt marker appears', () => {
    const shell = mockChildProcess();
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValue(1000);
    executeShellCmd(shell, 'ls', 1, onProgress, onComplete);

    shell.stdout.emit('data', 'file1.txt\n__JS_END_1_1000__\n');
    expect(onComplete).toHaveBeenCalledWith('file1.txt');
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('writes the command to stdin', () => {
    const shell = mockChildProcess();
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    executeShellCmd(shell, 'ls -la', 2, onProgress, onComplete);

    const writeArg = (shell.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(writeArg).toMatch(/^\{ :; ls -la\n/);
    expect(writeArg).toContain('__JS_END_2_');
  });

  it('collects output across multiple chunks before the prompt', () => {
    const shell = mockChildProcess();
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValue(2000);
    executeShellCmd(shell, 'echo hi', 3, onProgress, onComplete);

    shell.stdout.emit('data', 'hello\n');
    expect(onProgress).toHaveBeenLastCalledWith('hello\n');

    shell.stdout.emit('data', 'world\n');
    expect(onProgress).toHaveBeenLastCalledWith('hello\nworld\n');

    shell.stdout.emit('data', '__JS_END_3_2000__');
    expect(onComplete).toHaveBeenCalledWith('hello\nworld');
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  // A shell that exits mid-command never prints the sentinel; the end of its output is the only
  // signal left, and without it the tab's command queue would wait forever.
  it('completes with the partial output and an exit note when the shell\'s output ends', () => {
    const shell = mockChildProcess();
    const onComplete = vi.fn();

    executeShellCmd(shell, 'make', 1, vi.fn(), onComplete);
    shell.stdout.emit('data', 'building...\n');
    shell.stdout.emit('end');

    expect(onComplete).toHaveBeenCalledExactlyOnceWith(`building...\n${SHELL_EXITED_NOTE}`);
    expect(shell.stdout.removeListener).toHaveBeenCalledWith('end', expect.any(Function));
    expect(shell.stdout.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
    expect(shell.stderr.removeListener).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('completes with the exit note alone when the shell ends before printing anything', () => {
    const shell = mockChildProcess();
    const onComplete = vi.fn();

    executeShellCmd(shell, 'exit', 1, vi.fn(), onComplete);
    shell.stdout.emit('end');

    expect(onComplete).toHaveBeenCalledExactlyOnceWith(SHELL_EXITED_NOTE);
  });

  it('ignores the end of output once the sentinel has completed the command', () => {
    const shell = mockChildProcess();
    const onComplete = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValue(4000);
    executeShellCmd(shell, 'ls', 1, vi.fn(), onComplete);
    shell.stdout.emit('data', 'a\n__JS_END_1_4000__\n');
    shell.stdout.emit('end');

    expect(onComplete).toHaveBeenCalledExactlyOnceWith('a');
  });

  // A command queued behind the one that saw the exit captured the same dead shell; its `'end'`
  // has already fired, so it has to finish without waiting for one.
  it('completes at once, without writing, when the shell can no longer be written to', () => {
    const shell = mockChildProcess();
    (shell.stdin as { writable: boolean }).writable = false;
    const onComplete = vi.fn();

    executeShellCmd(shell, 'ls', 1, vi.fn(), onComplete);

    expect(onComplete).toHaveBeenCalledExactlyOnceWith(SHELL_EXITED_NOTE);
    expect(shell.stdin!.write).not.toHaveBeenCalled();
    expect(shell.stdout!.on).not.toHaveBeenCalled();
  });
});

describe('queryShellPwd', () => {
  it('calls onResult when the pwd prompt marker appears', () => {
    const shell = mockChildProcess();
    const onResult = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValue(3000);
    queryShellPwd(shell, 4, onResult);

    shell.stdout.emit('data', '/home/user\n__PWD_4_3000__\n');
    expect(onResult).toHaveBeenCalledWith('/home/user');
  });

  it('writes pwd command to stdin', () => {
    const shell = mockChildProcess();
    const onResult = vi.fn();

    queryShellPwd(shell, 5, onResult);

    const writeArg = (shell.stdin.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(writeArg).toMatch(/^pwd\n/);
    expect(writeArg).toContain('__PWD_5_');
  });

  it('completes with an empty result when the shell\'s output ends before the answer', () => {
    const shell = mockChildProcess();
    const onResult = vi.fn();

    queryShellPwd(shell, 6, onResult);
    shell.stdout.emit('data', '/home/us');
    shell.stdout.emit('end');

    expect(onResult).toHaveBeenCalledExactlyOnceWith('');
    expect(shell.stdout.removeListener).toHaveBeenCalledWith('end', expect.any(Function));
  });

  it('completes at once with an empty result when the shell can no longer be written to', () => {
    const shell = mockChildProcess();
    (shell.stdin as { writable: boolean }).writable = false;
    const onResult = vi.fn();

    queryShellPwd(shell, 7, onResult);

    expect(onResult).toHaveBeenCalledExactlyOnceWith('');
    expect(shell.stdin!.write).not.toHaveBeenCalled();
  });
});
