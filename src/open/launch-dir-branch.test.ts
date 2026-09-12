import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isLaunchDirOnPrimaryBranch, refreshLaunchDirBranch, resetLaunchDirBranch } from './launch-dir-branch.js';

function repo(root: string, branch: string): string {
  execSync(`git init -b ${branch}`, { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
  execSync('git commit --allow-empty -m snapshot', { cwd: root, stdio: 'pipe' });
  return root;
}

describe('launch-dir branch cache', () => {
  let root: string;
  let created: string[] = [];

  // Every directory a case makes goes through here, so cleanup covers the second repository the
  // different-launch-dir case needs and still runs when a case fails partway.
  function temporaryDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    created.push(dir);
    return dir;
  }

  beforeEach(() => {
    resetLaunchDirBranch();
    created = [];
    root = temporaryDir('launch-dir-branch-');
  });

  afterEach(() => {
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
  });

  it('reads as unconfirmed before its first resolution', () => {
    expect(isLaunchDirOnPrimaryBranch(root)).toBeUndefined();
  });

  it('reports the resolved pair after a refresh', async () => {
    repo(root, 'master');
    await refreshLaunchDirBranch(root);
    expect(isLaunchDirOnPrimaryBranch(root)).toBe(true);
  });

  it('classifies a feature branch as not primary after a refresh', async () => {
    repo(root, 'master');
    execSync('git checkout -b feature', { cwd: root, stdio: 'pipe' });
    await refreshLaunchDirBranch(root);
    expect(isLaunchDirOnPrimaryBranch(root)).toBe(false);
  });

  it('resolves unconfirmed (never syncs) when the launch dir is a plain detached-HEAD-style non-name', async () => {
    repo(root, 'master');
    execSync('git checkout --detach HEAD', { cwd: root, stdio: 'pipe' });
    await refreshLaunchDirBranch(root);
    expect(isLaunchDirOnPrimaryBranch(root)).toBe(false);
  });

  it('stays unconfirmed for a git failure — a launch dir that is not a repository', async () => {
    await refreshLaunchDirBranch(root);
    expect(isLaunchDirOnPrimaryBranch(root)).toBe(false);
  });

  it('classifies as unconfirmed against a cache holding a different launch dir', async () => {
    const other = temporaryDir('launch-dir-branch-other-');
    repo(other, 'master');
    await refreshLaunchDirBranch(other);
    expect(isLaunchDirOnPrimaryBranch(root)).toBeUndefined();
  });

  // A read never schedules a refresh, so a burst of opens that all reach the launch-dir fallback
  // must share one resolution rather than spawning a `git` pair each.
  it('coalesces concurrent refreshes for the same launch dir into one resolution', async () => {
    repo(root, 'master');
    const first = refreshLaunchDirBranch(root);
    const second = refreshLaunchDirBranch(root);

    expect(second).toBe(first);

    await first;
    expect(isLaunchDirOnPrimaryBranch(root)).toBe(true);

    // The entry clears on settle, so a later refresh is a fresh resolution rather than the old one.
    const afterSettle = refreshLaunchDirBranch(root);
    expect(afterSettle).not.toBe(first);
    await afterSettle;
  });

  it('leaves the cache untouched when only read', () => {
    repo(root, 'master');

    expect(isLaunchDirOnPrimaryBranch(root)).toBeUndefined();
    expect(isLaunchDirOnPrimaryBranch(root)).toBeUndefined();
  });
});
