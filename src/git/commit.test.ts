import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { file: string; args: string[]; options: { cwd?: string } };

let calls: Call[] = [];
// Which invocations fail, keyed by the git subcommand the call leads with. `diff` is handled
// separately below, since two `git diff --cached --quiet` probes now run per commit and each needs
// its own answer.
let failing = new Set<string>();
let commitStdout = '';
// Two `diff` probes run per commit: one before staging, answering whether the index already held the
// user's own changes, and one after, answering whether there is now anything to commit at all. Each
// entry answers one call in order, dirty meaning the probe fails (exits non-zero); the last entry
// repeats for any call beyond the array's length. `[false, true]` — clean before, staged after — is
// the ordinary case: nothing of the user's own was staged, and this action's own `git add` staged
// something.
let diffDirty: boolean[] = [false, true];
let diffCalls = 0;

vi.mock('node:child_process', () => ({
  execFile: (
    file: string, args: string[], options: Call['options'],
    callback: (err: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ file, args, options });
    if (args[0] === 'diff') {
      const dirty = diffDirty[Math.min(diffCalls, diffDirty.length - 1)];
      diffCalls += 1;
      if (dirty) callback(new Error('git diff failed'), { stdout: '', stderr: '' });
      else callback(null, { stdout: '', stderr: '' });
      return;
    }
    if (failing.has(args[0])) callback(new Error(`git ${args[0]} failed`), { stdout: '', stderr: '' });
    else callback(null, { stdout: args[0] === 'commit' ? commitStdout : '', stderr: '' });
  },
}));

const { commitRoot, commitLeftStagingInPlace } = await import('./commit.js');

const subcommands = () => calls.map((call) => call.args.join(' '));

beforeEach(() => {
  calls = [];
  failing = new Set();
  commitStdout = '';
  diffDirty = [false, true];
  diffCalls = 0;
});

describe('commitRoot', () => {
  it('stages, checks, commits, rebases, and pushes in that order, all at the given root', async () => {
    await commitRoot('/repo', 'commit: notes.md', ['/repo/notes.md']);

    expect(subcommands()).toEqual([
      'diff --cached --quiet',
      'add -A -- /repo/notes.md',
      'diff --cached --quiet',
      'commit -m commit: notes.md',
      'pull --rebase',
      'push',
    ]);
    for (const call of calls) expect(call).toMatchObject({ file: 'git', options: { cwd: '/repo' } });
  });

  it('scopes the whole-tree form to the tree root rather than the whole repository', async () => {
    await commitRoot('/repo/src', 'commit: 3 files', []);

    expect(calls[1].args).toEqual(['add', '-A', '--', '.']);
    expect(calls[1].options).toEqual({ cwd: '/repo/src' });
  });

  it('passes each path as its own argument rather than interpolating a string', async () => {
    await commitRoot('/repo', 'commit: 2 files', ['/repo/a b.md', '/repo/c.md']);

    expect(calls[1].args).toEqual(['add', '-A', '--', '/repo/a b.md', '/repo/c.md']);
  });

  it('passes the message as its own argument, so it can never become a flag', async () => {
    await commitRoot('/repo', '--amend me\nand more', ['/repo/a.md']);

    expect(calls[3].args).toEqual(['commit', '-m', '--amend me\nand more']);
  });

  it('names no remote and no branch on either the rebase or the push', async () => {
    await commitRoot('/repo', 'commit: a.md', ['/repo/a.md']);

    expect(calls[4].args).toEqual(['pull', '--rebase']);
    expect(calls[5].args).toEqual(['push']);
  });

  it('resolves with the last non-empty line of the commit output', async () => {
    commitStdout = '[main abc1234] commit: a.md\n 1 file changed, 2 insertions(+)\n\n';

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md']))
      .resolves.toEqual({ committed: true, summary: '1 file changed, 2 insertions(+)' });
  });

  it('answers nothing-to-commit without committing, rebasing, or pushing', async () => {
    diffDirty = [false, false];

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md']))
      .resolves.toEqual({ committed: false });
    expect(subcommands()).toEqual(['diff --cached --quiet', 'add -A -- /repo/a.md', 'diff --cached --quiet']);
  });

  it('aborts a failed rebase and still rejects with git\'s own error', async () => {
    failing = new Set(['pull']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
    expect(subcommands().at(-1)).toBe('rebase --abort');
    expect(subcommands()).not.toContain('push');
    expect(subcommands()).not.toContain('reset');
  });

  it('does not mask the rebase error when the abort itself fails', async () => {
    failing = new Set(['pull', 'rebase']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
  });

  it('never attempts to set an upstream when the rebase fails for want of one', async () => {
    failing = new Set(['pull']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
    expect(calls.flatMap((call) => call.args)).not.toContain('--set-upstream');
  });

  it('rejects with the git error when the push fails', async () => {
    failing = new Set(['push']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git push failed');
  });

  it('resets the index and rethrows unchanged when the commit fails over an index that was clean beforehand', async () => {
    failing = new Set(['commit']);

    let caught: unknown;
    try {
      await commitRoot('/repo', 'commit: a.md', ['/repo/a.md']);
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('git commit failed');
    expect(subcommands().at(-1)).toBe('reset');
    expect(commitLeftStagingInPlace(caught)).toBe(false);
  });

  it('leaves the index alone and flags the error when it was already dirty before the commit', async () => {
    failing = new Set(['commit']);
    diffDirty = [true, true];

    let caught: unknown;
    try {
      await commitRoot('/repo', 'commit: a.md', ['/repo/a.md']);
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('git commit failed');
    expect(subcommands()).not.toContain('reset');
    expect(commitLeftStagingInPlace(caught)).toBe(true);
  });

  it('does not flag an error that never left any staging behind', () => {
    expect(commitLeftStagingInPlace(new Error('unrelated'))).toBe(false);
  });
});
