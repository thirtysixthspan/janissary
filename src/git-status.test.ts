import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { changedPaths } from './git-status.js';

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

  it('includes a modified tracked file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'a.txt'), 'two');
    expect(await changedPaths(root)).toEqual(new Set(['a.txt']));
  });

  it('includes a staged file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'b.txt'), 'new');
    execSync('git add b.txt', { cwd: root, stdio: 'pipe' });
    expect(await changedPaths(root)).toEqual(new Set(['b.txt']));
  });

  it('includes an untracked file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'untracked.txt'), 'new');
    expect(await changedPaths(root)).toEqual(new Set(['untracked.txt']));
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
    expect(await changedPaths(sub)).toEqual(new Set(['a.txt', 'untracked.txt']));
  });

  it('resolves to an empty set for a directory that is not a git repository', async () => {
    expect(await changedPaths(root)).toEqual(new Set());
  });

  it('resolves to an empty set — never rejects — when the git invocation fails', async () => {
    await expect(changedPaths(path.join(root, 'does-not-exist'))).resolves.toEqual(new Set());
  });
});
