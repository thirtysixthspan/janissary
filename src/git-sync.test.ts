import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkspaceManager } from './workspace/manager.js';

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

vi.mock('./project-tokens.js', () => ({ getProjectTokens: () => ({ github: 'test-token' }) }));
vi.mock('./workspace/index.js', () => ({ workspacePath: (name: string) => `/repo/.janissary/workspace/${name}` }));

const { GitSync, SYNC_WORKSPACE_NAME } = await import('./git-sync.js');

function makeWorkspace(dir = '/repo/.janissary/workspace/git-sync', ready: Promise<void> = Promise.resolve()) {
  const create = vi.fn().mockReturnValue({ dir, ready });
  return { create, remove: vi.fn() } as unknown as WorkspaceManager;
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

  it('retries a synchronous workspace creation error', async () => {
    const create = vi.fn()
      .mockReturnValueOnce({ error: 'no repo' })
      .mockReturnValue({ dir: '/repo/.janissary/workspace/git-sync', ready: Promise.resolve() });
    const workspace = { create, remove: vi.fn() } as unknown as WorkspaceManager;
    const sync = new GitSync(workspace);
    expect(await sync.openSync()).toEqual({ error: 'no repo' });
    expect(calls).toHaveLength(0);
    expect(await sync.openSync()).toEqual({ dir: '/repo/.janissary/workspace/git-sync' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('cleans up a shared clone failure once and provisions again on retry', async () => {
    const dir = '/repo/.janissary/workspace/git-sync';
    const create = vi.fn()
      .mockReturnValueOnce({ dir, ready: Promise.reject(new Error('clone failed')) })
      .mockReturnValue({ dir, ready: Promise.resolve() });
    const remove = vi.fn();
    const workspace = { create, remove } as unknown as WorkspaceManager;
    const sync = new GitSync(workspace);
    const results = await Promise.all([sync.openSync(), sync.openSync()]);
    expect(results).toEqual([{ error: 'clone failed' }, { error: 'clone failed' }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(dir);
    expect(await sync.openSync()).toEqual({ dir });
    expect(create).toHaveBeenCalledTimes(2);
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

  it('a save cycle commits with sync: <filename>, pulls/rebases, then pushes, in order', async () => {
    failPatterns = [['diff', '--cached', '--quiet']];
    const sync = new GitSync(makeWorkspace());
    expect(await sync.saveSync('bugs.md')).toEqual({ ok: true });
    const commands = argLists().map((a) => a.join(' '));
    const commitIndex = commands.findIndex((c) => c.startsWith('commit'));
    const pullIndex = commands.findIndex((c) => c.startsWith('pull'));
    const pushIndex = commands.findIndex((c) => c.startsWith('push'));
    expect(commands[commitIndex]).toContain('sync: bugs.md');
    expect(commitIndex).toBeLessThan(pullIndex);
    expect(pullIndex).toBeLessThan(pushIndex);
  });

  it('uses the saved file\'s name in the commit message', async () => {
    failPatterns = [['diff', '--cached', '--quiet']];
    const sync = new GitSync(makeWorkspace());
    await sync.saveSync('notes.md');
    const commands = argLists().map((a) => a.join(' '));
    const commitCommand = commands.find((c) => c.startsWith('commit'));
    expect(commitCommand).toContain('sync: notes.md');
  });

  it('skips the commit when there is nothing staged', async () => {
    const sync = new GitSync(makeWorkspace());
    await sync.saveSync('bugs.md');
    const commands = argLists().map((a) => a[0]);
    expect(commands).not.toContain('commit');
    expect(commands).toContain('push');
  });

  it('preserves the local commit and reports an error when a save pull fails', async () => {
    failPatterns = [['diff', '--cached', '--quiet'], ['pull', '--rebase', 'origin', 'master']];
    const sync = new GitSync(makeWorkspace());
    const result = await sync.saveSync('bugs.md');
    const commands = argLists().map((a) => a.join(' '));
    expect(result).toEqual({ error: expect.stringContaining('pull') });
    expect(commands.some((command) => command.startsWith('commit'))).toBe(true);
    expect(commands).toContain('rebase --abort');
    expect(commands.some((command) => command.startsWith('fetch'))).toBe(false);
    expect(commands.some((command) => command.startsWith('reset'))).toBe(false);
    expect(commands.some((command) => command.startsWith('push'))).toBe(false);
  });

  it('surfaces a push failure as an error result', async () => {
    failPatterns = [['diff', '--cached', '--quiet'], ['push', 'origin', 'HEAD:master']];
    const sync = new GitSync(makeWorkspace());
    const result = await sync.saveSync('bugs.md');
    expect(result).toEqual({ error: expect.stringContaining('push') });
  });

  it('passes GH_TOKEN in the environment of the pull and push execFile calls', async () => {
    failPatterns = [['diff', '--cached', '--quiet']];
    const sync = new GitSync(makeWorkspace());
    await sync.saveSync('bugs.md');
    const pullCall = calls.find((c) => c.args[0] === 'pull');
    const pushCall = calls.find((c) => c.args[0] === 'push');
    expect(pullCall?.options.env?.GH_TOKEN).toBe('test-token');
    expect(pushCall?.options.env?.GH_TOKEN).toBe('test-token');
  });
});
