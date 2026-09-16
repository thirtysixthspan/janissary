import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { file: string; args: string[]; options: { cwd?: string } };

let calls: Call[] = [];
// Which invocations fail, keyed by the git subcommand the call leads with. `diff` is how the
// nothing-to-commit branch is driven: `git diff --cached --quiet` exits zero when nothing is staged,
// which is the *failing*-is-normal case inverted — it fails here to mean "something is staged".
let failing = new Set<string>(['diff']);
let commitStdout = '';

vi.mock('node:child_process', () => ({
  execFile: (
    file: string, args: string[], options: Call['options'],
    callback: (err: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ file, args, options });
    if (failing.has(args[0])) callback(new Error(`git ${args[0]} failed`), { stdout: '', stderr: '' });
    else callback(null, { stdout: args[0] === 'commit' ? commitStdout : '', stderr: '' });
  },
}));

const { commitRoot } = await import('./commit.js');

const subcommands = () => calls.map((call) => call.args.join(' '));

beforeEach(() => {
  calls = [];
  failing = new Set(['diff']);
  commitStdout = '';
});

describe('commitRoot', () => {
  it('stages, checks, commits, rebases, and pushes in that order, all at the given root', async () => {
    await commitRoot('/repo', 'commit: notes.md', ['/repo/notes.md']);

    expect(subcommands()).toEqual([
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

    expect(calls[0].args).toEqual(['add', '-A', '--', '.']);
    expect(calls[0].options).toEqual({ cwd: '/repo/src' });
  });

  it('passes each path as its own argument rather than interpolating a string', async () => {
    await commitRoot('/repo', 'commit: 2 files', ['/repo/a b.md', '/repo/c.md']);

    expect(calls[0].args).toEqual(['add', '-A', '--', '/repo/a b.md', '/repo/c.md']);
  });

  it('passes the message as its own argument, so it can never become a flag', async () => {
    await commitRoot('/repo', '--amend me\nand more', ['/repo/a.md']);

    expect(calls[2].args).toEqual(['commit', '-m', '--amend me\nand more']);
  });

  it('names no remote and no branch on either the rebase or the push', async () => {
    await commitRoot('/repo', 'commit: a.md', ['/repo/a.md']);

    expect(calls[3].args).toEqual(['pull', '--rebase']);
    expect(calls[4].args).toEqual(['push']);
  });

  it('resolves with the last non-empty line of the commit output', async () => {
    commitStdout = '[main abc1234] commit: a.md\n 1 file changed, 2 insertions(+)\n\n';

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md']))
      .resolves.toEqual({ committed: true, summary: '1 file changed, 2 insertions(+)' });
  });

  it('answers nothing-to-commit without committing, rebasing, or pushing', async () => {
    failing = new Set();

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md']))
      .resolves.toEqual({ committed: false });
    expect(subcommands()).toEqual(['add -A -- /repo/a.md', 'diff --cached --quiet']);
  });

  it('aborts a failed rebase and still rejects with git\'s own error', async () => {
    failing = new Set(['diff', 'pull']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
    expect(subcommands().at(-1)).toBe('rebase --abort');
    expect(subcommands()).not.toContain('push');
  });

  it('does not mask the rebase error when the abort itself fails', async () => {
    failing = new Set(['diff', 'pull', 'rebase']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
  });

  it('never attempts to set an upstream when the rebase fails for want of one', async () => {
    failing = new Set(['diff', 'pull']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git pull failed');
    expect(calls.flatMap((call) => call.args)).not.toContain('--set-upstream');
  });

  it('rejects with the git error when the push fails', async () => {
    failing = new Set(['diff', 'push']);

    await expect(commitRoot('/repo', 'commit: a.md', ['/repo/a.md'])).rejects.toThrow('git push failed');
  });
});
