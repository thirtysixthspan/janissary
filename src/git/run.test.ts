import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GIT_COMMAND_TIMEOUT_MS, runGit } from './run.js';

type Options = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeout?: number;
  killSignal?: NodeJS.Signals;
};
const calls: { file: string; args: string[]; options: Options }[] = [];
let shouldFail = false;

vi.mock('node:child_process', () => ({
  execFile: (
    file: string, args: string[], options: Options,
    callback: (error: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ file, args, options });
    if (shouldFail) callback(new Error('git failed'), { stdout: '', stderr: 'failure' });
    else callback(null, { stdout: 'done', stderr: '' });
  },
}));

beforeEach(() => {
  calls.length = 0;
  shouldFail = false;
});

describe('runGit', () => {
  it('runs Git with a bounded default, no terminal prompts, and the inherited environment', async () => {
    await expect(runGit(['pull'], '/repo')).resolves.toEqual({ stdout: 'done', stderr: '' });

    expect(calls[0]).toMatchObject({
      file: 'git',
      args: ['pull'],
      options: {
        cwd: '/repo',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: GIT_COMMAND_TIMEOUT_MS,
        killSignal: 'SIGTERM',
      },
    });
  });

  it('forwards a cancellation signal and caller-supplied deadline', async () => {
    const signal = new AbortController().signal;
    await runGit(['status'], '/repo', { signal, timeout: 1234 });

    expect(calls[0]?.options).toMatchObject({ signal, timeout: 1234 });
  });

  it('rejects with the Git process error', async () => {
    shouldFail = true;

    await expect(runGit(['pull'], '/repo')).rejects.toThrow('git failed');
  });
});
