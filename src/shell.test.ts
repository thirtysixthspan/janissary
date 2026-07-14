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

import { spawnShell, executeShellCmd, queryShellPwd } from './shell.js';

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
    expect(call[1]).toEqual(['--norc', '--noprofile']);
    expect(call[2]).toMatchObject({ stdio: ['pipe', 'pipe', 'pipe'] });
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
    expect(writeArg).toMatch(/^ls -la 2>&1\n/);
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
});
