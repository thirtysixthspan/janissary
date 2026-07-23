import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkspaceManager } from './workspace-manager.js';

type Call = { args: string[]; options: { cwd?: string; env?: NodeJS.ProcessEnv } };

let calls: Call[] = [];
let failPatterns: string[][] = [];

vi.mock('node:child_process', () => ({
  execFile: (
    _file: string, args: string[], options: Call['options'],
    callback: (err: unknown, result: { stdout: string; stderr: string }) => void,
  ) => {
    calls.push({ args, options });
    const shouldFail = failPatterns.some((pattern) => pattern.every((value, i) => args[i] === value));
    if (shouldFail) callback(new Error(`git ${args.join(' ')} failed`), { stdout: '', stderr: '' });
    else callback(null, { stdout: '', stderr: '' });
  },
}));

vi.mock('./github-token.js', () => ({ getGithubToken: () => 'test-token' }));
vi.mock('./workspace.js', () => ({ workspacePath: (name: string) => `/repo/.janissary/workspace/${name}` }));

const { GitSync, SYNC_WORKSPACE_NAME, SYNC_COMMIT_MESSAGE } = await import('./git-sync.js');

function makeWorkspace(dir = '/repo/.janissary/workspace/git-sync', ready: Promise<void> = Promise.resolve()) {
  const create = vi.fn().mockReturnValue({ dir, ready });
  return { create } as unknown as WorkspaceManager;
}

function argLists(): string[][] {
  return calls.map((c) => c.args);
}

beforeEach(() => {
  calls = [];
  failPatterns = [];
});

describe('GitSync', () => {
  it('resolves a synced file\'s path inside the shared workspace', () => {
    const sync = new GitSync(makeWorkspace());
    expect(sync.workspaceFilePath('notes/todo.md')).toBe(`/repo/.janissary/workspace/${SYNC_WORKSPACE_NAME}/notes/todo.md`);
  });

  it('provisions the shared workspace lazily exactly once for concurrent opens', async () => {
    const workspace = makeWorkspace();
    const sync = new GitSync(workspace);
    const [a, b] = await Promise.all([sync.openSync(), sync.openSync()]);
    expect(workspace.create).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ dir: '/repo/.janissary/workspace/git-sync' });
    expect(b).toEqual(a);
  });

  it('surfaces a workspace provisioning error without touching git', async () => {
    const workspace = { create: vi.fn().mockReturnValue({ error: 'no repo' }) } as unknown as WorkspaceManager;
    const sync = new GitSync(workspace);
    expect(await sync.openSync()).toEqual({ error: 'no repo' });
    expect(calls).toHaveLength(0);
  });

  it('surfaces a clone failure', async () => {
    const workspace = makeWorkspace('/repo/.janissary/workspace/git-sync', Promise.reject(new Error('clone failed')));
    const sync = new GitSync(workspace);
    expect(await sync.openSync()).toEqual({ error: 'clone failed' });
  });

  it('the pull-only cycle pulls/rebases without committing or pushing', async () => {
    const sync = new GitSync(makeWorkspace());
    const result = await sync.openSync();
    expect(result).toEqual({ dir: '/repo/.janissary/workspace/git-sync' });
    const commands = argLists().map((a) => a[0]);
    expect(commands).toContain('pull');
    expect(commands).not.toContain('commit');
    expect(commands).not.toContain('push');
  });

  it('a save cycle commits with the fixed message, pulls/rebases, then pushes, in order', async () => {
    failPatterns = [['diff', '--cached', '--quiet']];
    const sync = new GitSync(makeWorkspace());
    expect(await sync.saveSync()).toEqual({ ok: true });
    const commands = argLists().map((a) => a.join(' '));
    const commitIndex = commands.findIndex((c) => c.startsWith('commit'));
    const pullIndex = commands.findIndex((c) => c.startsWith('pull'));
    const pushIndex = commands.findIndex((c) => c.startsWith('push'));
    expect(commands[commitIndex]).toContain(SYNC_COMMIT_MESSAGE);
    expect(commitIndex).toBeLessThan(pullIndex);
    expect(pullIndex).toBeLessThan(pushIndex);
  });

  it('skips the commit when there is nothing staged', async () => {
    const sync = new GitSync(makeWorkspace());
    await sync.saveSync();
    const commands = argLists().map((a) => a[0]);
    expect(commands).not.toContain('commit');
    expect(commands).toContain('push');
  });

  it('resolves a rebase conflict by taking the remote content', async () => {
    failPatterns = [['pull', '--rebase', 'origin', 'master']];
    const sync = new GitSync(makeWorkspace());
    await sync.openSync();
    const commands = argLists().map((a) => a.join(' '));
    expect(commands).toContain('rebase --abort');
    expect(commands).toContain('fetch origin master');
    expect(commands).toContain('reset --hard origin/master');
  });

  it('surfaces a push failure as an error result', async () => {
    failPatterns = [['diff', '--cached', '--quiet'], ['push', 'origin', 'HEAD:master']];
    const sync = new GitSync(makeWorkspace());
    const result = await sync.saveSync();
    expect(result).toEqual({ error: expect.stringContaining('push') });
  });

  it('passes GH_TOKEN in the environment of the pull and push execFile calls', async () => {
    failPatterns = [['diff', '--cached', '--quiet']];
    const sync = new GitSync(makeWorkspace());
    await sync.saveSync();
    const pullCall = calls.find((c) => c.args[0] === 'pull');
    const pushCall = calls.find((c) => c.args[0] === 'push');
    expect(pullCall?.options.env?.GH_TOKEN).toBe('test-token');
    expect(pushCall?.options.env?.GH_TOKEN).toBe('test-token');
  });
});
