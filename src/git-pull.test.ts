import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { file: string; args: string[]; options: { cwd?: string } };

let calls: Call[] = [];
let fail = false;

vi.mock('node:child_process', () => ({
  execFile: (
    file: string, args: string[], options: Call['options'],
    callback: (err: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ file, args, options });
    if (fail) callback(new Error('git pull failed'), { stdout: '', stderr: 'conflict' });
    else callback(null, { stdout: '', stderr: '' });
  },
}));

const { pullRoot } = await import('./git-pull.js');

beforeEach(() => {
  calls = [];
  fail = false;
});

describe('pullRoot', () => {
  it('runs git pull at the given root and resolves when it succeeds', async () => {
    await expect(pullRoot('/repo')).resolves.toBeUndefined();
    expect(calls).toEqual([{ file: 'git', args: ['pull'], options: { cwd: '/repo' } }]);
  });

  it('rejects with the git failure so the caller can report it', async () => {
    fail = true;
    await expect(pullRoot('/repo')).rejects.toThrow('git pull failed');
  });
});
