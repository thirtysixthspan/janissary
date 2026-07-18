import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { listProjectFiles } from './search.js';

function initRepo(root: string): void {
  execSync('git init', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

function commitAll(root: string): void {
  execSync('git add -A', { cwd: root, stdio: 'pipe' });
  execSync('git commit -m snapshot', { cwd: root, stdio: 'pipe' });
}

describe('listProjectFiles', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'project-files-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('returns a promise', () => {
    expect(listProjectFiles(root)).toBeInstanceOf(Promise);
  });

  it('includes tracked and new-but-unignored files in a git repo', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    commitAll(root);
    writeFileSync(path.join(root, 'b.txt'), 'new');
    const files = await listProjectFiles(root);
    expect(files).toEqual(['a.txt', 'b.txt']);
  });

  it('excludes gitignore-matched paths in a git repo', async () => {
    initRepo(root);
    writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
    mkdirSync(path.join(root, 'node_modules'));
    writeFileSync(path.join(root, 'node_modules', 'x.js'), 'ignored');
    writeFileSync(path.join(root, 'a.txt'), 'kept');
    commitAll(root);
    const files = await listProjectFiles(root);
    expect(files).toEqual(['.gitignore', 'a.txt']);
  });

  it('lists nested files with a subdirectory-relative path', async () => {
    initRepo(root);
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'sub', 'nested.txt'), 'one');
    commitAll(root);
    const files = await listProjectFiles(root);
    expect(files).toEqual(['sub/nested.txt']);
  });

  it('falls back to an async walk listing files and skipping default excludes in a non-git directory', async () => {
    mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, '.git', 'ignored.txt'), 'skip');
    writeFileSync(path.join(root, 'a.txt'), 'one');
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'sub', 'b.txt'), 'two');
    const files = await listProjectFiles(root);
    expect(files.toSorted((a, b) => a.localeCompare(b))).toEqual(['a.txt', 'sub/b.txt']);
  });

  it('never includes directories in the result', async () => {
    mkdirSync(path.join(root, 'empty-dir'));
    writeFileSync(path.join(root, 'a.txt'), 'one');
    const files = await listProjectFiles(root);
    expect(files).toEqual(['a.txt']);
  });
});
