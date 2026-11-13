import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadIgnoredPaths } from './ignored.js';

function initRepo(root: string): void {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

function commitAll(root: string): void {
  execSync('git add -A', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m snapshot', { cwd: root, stdio: 'pipe' });
}

function write(root: string, relative: string, content = 'x'): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

describe('loadIgnoredPaths', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-glob-ignored-')); });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  function initIgnoringRepo(): void {
    initRepo(root);
    write(root, '.gitignore', 'dist/\n*.log\n');
    commitAll(root);
  }

  it('collects ignored files and collapsed ignored directories without trailing slashes', async () => {
    initIgnoringRepo();
    write(root, 'dist/sub/y.js');
    write(root, 'a.log');
    write(root, 'keep.txt');
    const ignored = await loadIgnoredPaths(root);
    expect(ignored.has('dist')).toBe(true);
    expect(ignored.has('a.log')).toBe(true);
    expect(ignored.has('dist/sub/y.js')).toBe(false);
    expect(ignored.has('keep.txt')).toBe(false);
  });

  it('includes a directory whose untracked contents are all ignored', async () => {
    initIgnoringRepo();
    write(root, 'logs/b.log');
    write(root, 'logs/c.log');
    const ignored = await loadIgnoredPaths(root);
    expect(ignored.has('logs')).toBe(true);
  });

  it('leaves out a tracked file that matches an ignore rule', async () => {
    initIgnoringRepo();
    write(root, 'tracked.log');
    execSync('git add -f tracked.log', { cwd: root, stdio: 'pipe' });
    execSync('git commit -m tracked', { cwd: root, stdio: 'pipe' });
    const ignored = await loadIgnoredPaths(root);
    expect(ignored.has('tracked.log')).toBe(false);
  });

  it('answers paths relative to a subdirectory root', async () => {
    initRepo(root);
    write(root, '.gitignore', 'deep/\n');
    write(root, 'sub/keep.txt');
    commitAll(root);
    write(root, 'sub/deep/z.txt');
    const ignored = await loadIgnoredPaths(path.join(root, 'sub'));
    expect(ignored.has('deep')).toBe(true);
    expect(ignored.has('sub/deep')).toBe(false);
  });

  it('returns an empty set for a root inside an ignored directory', async () => {
    initIgnoringRepo();
    write(root, 'dist/sub/y.js');
    const ignored = await loadIgnoredPaths(path.join(root, 'dist'));
    expect(ignored.size).toBe(0);
  });

  it('returns an empty set outside any repository', async () => {
    vi.stubEnv('GIT_CEILING_DIRECTORIES', path.dirname(realpathSync(root)));
    write(root, 'a.log');
    const ignored = await loadIgnoredPaths(root);
    expect(ignored.size).toBe(0);
  });

  it('resolves to an empty set — never rejects — when the root does not exist', async () => {
    await expect(loadIgnoredPaths(path.join(root, 'does-not-exist'))).resolves.toEqual(new Set());
  });
});
