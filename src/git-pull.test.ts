import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { file: string; args: string[]; options: { cwd?: string } };

let calls: Call[] = [];
let fail = false;
let stdout = '';

vi.mock('node:child_process', () => ({
  execFile: (
    file: string, args: string[], options: Call['options'],
    callback: (err: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ file, args, options });
    if (fail) callback(new Error('git pull failed'), { stdout: '', stderr: 'conflict' });
    else callback(null, { stdout, stderr: '' });
  },
}));

const { pullRoot, pullSummary } = await import('./git-pull.js');

beforeEach(() => {
  calls = [];
  fail = false;
  stdout = '';
});

describe('pullSummary', () => {
  it('keeps a single-line outcome as it is', () => {
    expect(pullSummary('Already up to date.\n')).toBe('Already up to date.');
  });

  it('takes the diffstat total from the end of a multi-line report', () => {
    const report = [
      'Updating fc5d7d9..abc1234',
      'Fast-forward',
      ' src/git-pull.ts | 12 ++++++++----',
      ' 3 files changed, 12 insertions(+), 4 deletions(-)',
      '',
      '',
    ].join('\n');
    expect(pullSummary(report)).toBe('3 files changed, 12 insertions(+), 4 deletions(-)');
  });

  it('answers empty when git printed nothing to stdout', () => {
    expect(pullSummary('   \n\n')).toBe('');
  });
});

describe('pullRoot', () => {
  it('runs git pull at the given root and resolves with git\'s own summary', async () => {
    stdout = 'Already up to date.\n';
    await expect(pullRoot('/repo')).resolves.toBe('Already up to date.');
    expect(calls).toEqual([{ file: 'git', args: ['pull'], options: { cwd: '/repo' } }]);
  });

  it('resolves with an empty summary when git printed nothing', async () => {
    await expect(pullRoot('/repo')).resolves.toBe('');
  });

  it('rejects with the git failure so the caller can report it', async () => {
    fail = true;
    await expect(pullRoot('/repo')).rejects.toThrow('git pull failed');
  });
});
