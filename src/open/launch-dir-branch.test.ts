import { describe, it, expect, beforeEach } from 'vitest';
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

  beforeEach(() => {
    resetLaunchDirBranch();
    root = mkdtempSync(path.join(tmpdir(), 'launch-dir-branch-'));
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
    const other = mkdtempSync(path.join(tmpdir(), 'launch-dir-branch-other-'));
    repo(other, 'master');
    await refreshLaunchDirBranch(other);
    expect(isLaunchDirOnPrimaryBranch(root)).toBeUndefined();
    rmSync(other, { recursive: true, force: true });
  });
});
