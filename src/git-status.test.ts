import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { changedPaths, currentBranch } from './git-status.js';

function initRepo(root: string): void {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

function commitAll(root: string): void {
  execSync('git add -A', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m snapshot', { cwd: root, stdio: 'pipe' });
}

describe('changedPaths', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'git-status-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('classifies a modified tracked file as changed', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'a.txt'), 'two');
    expect(await changedPaths(root)).toEqual(new Map([['a.txt', 'changed']]));
  });

  it('classifies a staged file as staged', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'b.txt'), 'new');
    execSync('git add b.txt', { cwd: root, stdio: 'pipe' });
    expect(await changedPaths(root)).toEqual(new Map([['b.txt', 'staged']]));
  });

  it('classifies an untracked file as changed', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'untracked.txt'), 'new');
    expect(await changedPaths(root)).toEqual(new Map([['untracked.txt', 'changed']]));
  });

  it('classifies a partially-staged file (staged, then further edited) as staged', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'a.txt'), 'two');
    execSync('git add a.txt', { cwd: root, stdio: 'pipe' });
    writeFileSync(path.join(root, 'a.txt'), 'three');
    expect(await changedPaths(root)).toEqual(new Map([['a.txt', 'staged']]));
  });

  it('classifies an unmerged path from a merge conflict as conflict', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'base');
    commitAll(root);
    execSync('git checkout -b feature', { cwd: root, stdio: 'pipe' });
    writeFileSync(path.join(root, 'a.txt'), 'feature');
    commitAll(root);
    execSync('git checkout master', { cwd: root, stdio: 'pipe' });
    writeFileSync(path.join(root, 'a.txt'), 'master');
    commitAll(root);
    try { execSync('git merge feature', { cwd: root, stdio: 'pipe' }); } catch { /* conflict expected */ }
    expect(await changedPaths(root)).toEqual(new Map([['a.txt', 'conflict']]));
  });

  it('lists a file inside a wholly-untracked directory individually, not the collapsed directory', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    mkdirSync(path.join(root, 'newdir'));
    writeFileSync(path.join(root, 'newdir', 'x.txt'), 'new');
    const changed = await changedPaths(root);
    expect(changed.has('newdir/x.txt')).toBe(true);
    expect(changed.has('newdir')).toBe(false);
    expect(changed.has('newdir/')).toBe(false);
  });

  it('includes both the new and the old path of a renamed tracked file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'old.txt'), 'content');
    commitAll(root);
    execSync('git mv old.txt new.txt', { cwd: root, stdio: 'pipe' });
    const changed = await changedPaths(root);
    expect(changed.has('new.txt')).toBe(true);
    expect(changed.has('old.txt')).toBe(true);
  });

  it('returns paths relative to the tree root when it sits below the repo root', async () => {
    initRepo(root);
    const sub = path.join(root, 'sub');
    mkdirSync(sub);
    writeFileSync(path.join(sub, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(sub, 'a.txt'), 'two');
    writeFileSync(path.join(sub, 'untracked.txt'), 'new');
    expect(await changedPaths(sub)).toEqual(new Map([['a.txt', 'changed'], ['untracked.txt', 'changed']]));
  });

  it('resolves to an empty map for a directory that is not a git repository', async () => {
    expect(await changedPaths(root)).toEqual(new Map());
  });

  it('resolves to an empty map — never rejects — when the git invocation fails', async () => {
    await expect(changedPaths(path.join(root, 'does-not-exist'))).resolves.toEqual(new Map());
  });
});

describe('currentBranch', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'git-status-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('returns the current branch name on a repo checked out to a named branch', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    execSync('git checkout -b feature', { cwd: root, stdio: 'pipe' });
    expect(await currentBranch(root)).toBe('feature');
  });

  it("returns 'HEAD' for a detached-HEAD checkout", async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    execSync('git checkout --detach HEAD', { cwd: root, stdio: 'pipe' });
    expect(await currentBranch(root)).toBe('HEAD');
  });

  it('resolves to undefined for a directory that is not a git repository', async () => {
    expect(await currentBranch(root)).toBeUndefined();
  });

  it('resolves to undefined — never rejects — when the git invocation fails', async () => {
    await expect(currentBranch(path.join(root, 'does-not-exist'))).resolves.toBeUndefined();
  });
});
