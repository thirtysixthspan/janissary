import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initWorkspaceDir } from './index.js';
import { provisionSyncWorktree, removeSyncWorktree } from './worktree.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

let root: string;
let origin: string;
let main: string;
let claudeJson: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'janus-worktree-'));
  origin = path.join(root, 'origin.git');
  main = path.join(root, 'main');
  claudeJson = path.join(root, 'claude.json');
  git(root, 'init', '-q', '--bare', '--initial-branch=main', origin);
  git(root, 'clone', '-q', origin, main);
  git(main, 'config', 'user.email', 'test@test.com');
  git(main, 'config', 'user.name', 'test');
  mkdirSync(path.join(main, 'product', 'backlog'), { recursive: true });
  mkdirSync(path.join(main, 'other'), { recursive: true });
  writeFileSync(path.join(main, 'product', 'backlog', 'issues.md'), 'seed\n');
  writeFileSync(path.join(main, 'other', 'secret.txt'), 'seed\n');
  git(main, 'add', '-A');
  git(main, 'commit', '-qm', 'seed');
  git(main, 'push', '-q', '-u', 'origin', 'main');
  git(main, 'remote', 'set-head', 'origin', 'main');
  initWorkspaceDir(main, claudeJson);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('git-sync worktree provisioning', () => {
  it('provisions a detached product-only worktree of the project repository', async () => {
    const handle = provisionSyncWorktree('git-sync', main);
    await handle.ready;
    const target = handle.dir;

    expect(target).toBe(path.join(main, '.janissary', 'workspace', 'git-sync'));
    expect(existsSync(path.join(target, '.git'))).toBe(true);
    expect(git(target, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('HEAD');
    expect(git(target, 'rev-parse', 'HEAD').trim()).toBe(git(main, 'rev-parse', 'refs/remotes/origin/HEAD').trim());
    expect(existsSync(path.join(target, 'product', 'backlog', 'issues.md'))).toBe(true);
    expect(existsSync(path.join(target, 'other', 'secret.txt'))).toBe(false);
    expect(existsSync(`${target}.tmp`)).toBe(true);

    const config = JSON.parse(readFileSync(claudeJson, 'utf8')) as {
      projects: Record<string, { hasTrustDialogAccepted?: boolean }>;
    };
    expect(config.projects[target]?.hasTrustDialogAccepted).toBe(true);

    expect(git(main, 'remote', 'get-url', 'origin').trim()).toBe(origin);
    expect(existsSync(path.join(main, 'other', 'secret.txt'))).toBe(true);
  });

  it('drops the worktree registration on removal and can provision the same path again', async () => {
    const first = provisionSyncWorktree('git-sync', main);
    await first.ready;
    const target = first.dir;
    expect(git(main, 'worktree', 'list')).toContain(target);

    removeSyncWorktree(target, main);
    expect(git(main, 'worktree', 'list')).not.toContain(target);
    expect(existsSync(target)).toBe(false);

    const second = provisionSyncWorktree('git-sync', main);
    await expect(second.ready).resolves.toBeUndefined();
    expect(git(main, 'worktree', 'list')).toContain(second.dir);
  });

  it('cleans up a failed add so a later attempt can provision fresh', async () => {
    const target = path.join(main, '.janissary', 'workspace', 'git-sync');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'blocker');

    const failed = provisionSyncWorktree('git-sync', main);
    await expect(failed.ready).rejects.toThrow();
    expect(existsSync(target)).toBe(false);

    const retry = provisionSyncWorktree('git-sync', main);
    await expect(retry.ready).resolves.toBeUndefined();
    expect(git(main, 'worktree', 'list')).toContain(retry.dir);
  });
});
