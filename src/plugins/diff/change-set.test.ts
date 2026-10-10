import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isChangeSetResult, readChangeSet } from './change-set.js';
import type { DiffFile } from './shared.js';

// The repository fixtures are built the way `src/git/status.test.ts` builds them: a real temporary
// repository, because the change set is git's answer and only git can give it.

function initRepo(root: string): void {
  execSync('git init -b master', { cwd: root, stdio: 'pipe' });
  execSync('git config user.email test@test.com', { cwd: root, stdio: 'pipe' });
  execSync('git config user.name test', { cwd: root, stdio: 'pipe' });
}

function commitAll(root: string, message: string): void {
  execSync('git add -A', { cwd: root, stdio: 'pipe' });
  execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: root, stdio: 'pipe' });
}

function pathsOf(result: Awaited<ReturnType<typeof readChangeSet>>): string[] {
  return result.kind === 'files' ? result.files.map((file) => file.path) : [];
}

describe('readChangeSet', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'diff-change-set-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('reports a modified file, a staged file, and an untracked file together', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'tracked.txt'), 'one');
    commitAll(root, 'init');
    writeFileSync(path.join(root, 'tracked.txt'), 'two');
    writeFileSync(path.join(root, 'staged.txt'), 'staged');
    execSync('git add staged.txt', { cwd: root, stdio: 'pipe' });
    writeFileSync(path.join(root, 'untracked.txt'), 'new');

    const result = await readChangeSet(root);
    expect(result.kind).toBe('files');
    expect(pathsOf(result)).toEqual(['staged.txt', 'tracked.txt', 'untracked.txt']);    const tracked = result.kind === 'files' ? result.files.find((file) => file.path === 'tracked.txt') : undefined;
    expect(tracked?.hunks[0].lines.map((line) => line.kind)).toEqual(['removed', 'added']);
    const untracked = result.kind === 'files' ? result.files.find((file) => file.path === 'untracked.txt') : undefined;
    expect(untracked?.additions).toBe(1);
    expect(untracked?.deletions).toBe(0);
  });

  it('reports a deleted file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'gone.txt'), 'content');
    commitAll(root, 'init');
    rmSync(path.join(root, 'gone.txt'));

    const result = await readChangeSet(root);
    expect(pathsOf(result)).toEqual(['gone.txt']);
    expect(result.kind === 'files' && result.files[0].deleted).toBe(true);
  });

  it('reports a rename with its old and new paths', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'old.txt'), 'one\ntwo\nthree\n');
    commitAll(root, 'init');
    execSync('git mv old.txt new.txt', { cwd: root, stdio: 'pipe' });
    writeFileSync(path.join(root, 'new.txt'), 'one\nTWO\nthree\n');

    const result = await readChangeSet(root);
    expect(result.kind === 'files' && result.files[0]).toMatchObject({ path: 'new.txt', oldPath: 'old.txt' });
  });

  it('reports a binary file as binary', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'bin.dat'), Buffer.from([0, 1, 2, 3]));
    commitAll(root, 'init');
    writeFileSync(path.join(root, 'bin.dat'), Buffer.from([0, 1, 2, 4]));

    const result = await readChangeSet(root);
    expect(result.kind === 'files' && result.files[0]).toMatchObject({ path: 'bin.dat', binary: true, hunks: [] });
  });

  it('answers not-repository for a directory outside a git repository', async () => {
    expect(await readChangeSet(root)).toEqual({ kind: 'not-repository' });
  });

  it('reads a repository with no commits as all-added', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'a.txt'), 'one');
    writeFileSync(path.join(root, 'b.txt'), 'two');

    const result = await readChangeSet(root);
    expect(pathsOf(result)).toEqual(['a.txt', 'b.txt']);
    expect(result.kind === 'files' && result.files[0].additions).toBe(1);
  });

  it('answers not-repository rather than a failure for a directory that does not exist', async () => {
    expect(await readChangeSet(path.join(root, 'missing'))).toEqual({ kind: 'not-repository' });
  });

  it('includes whitespace-only changes', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'spaces.txt'), 'one\ntwo\n');
    writeFileSync(path.join(root, 'other.txt'), 'a\n');
    commitAll(root, 'init');
    writeFileSync(path.join(root, 'spaces.txt'), 'one   \ntwo\n');
    writeFileSync(path.join(root, 'other.txt'), 'b\n');
    writeFileSync(path.join(root, 'pad.txt'), '  padded\n');

    const result = await readChangeSet(root);
    expect(pathsOf(result)).toEqual(['other.txt', 'pad.txt', 'spaces.txt']);
    const whitespaceChange = result.kind === 'files' ? result.files.find((file) => file.path === 'spaces.txt') : undefined;
    expect(whitespaceChange?.hunks[0].lines.map((line) => line.kind)).toEqual(['removed', 'added', 'context']);
  });

  it('includes a whitespace-only untracked file', async () => {
    initRepo(root);
    writeFileSync(path.join(root, 'seed.txt'), 'seed');
    commitAll(root, 'init');
    writeFileSync(path.join(root, 'blank.txt'), '   \n');

    expect(pathsOf(await readChangeSet(root))).toEqual(['blank.txt']);
  });

  it('scopes the records to a subdirectory and strips the repository prefix', async () => {
    initRepo(root);
    mkdirSync(path.join(root, 'sub'));
    writeFileSync(path.join(root, 'sub', 'inner.txt'), 'one');
    writeFileSync(path.join(root, 'outer.txt'), 'one');
    commitAll(root, 'init');
    writeFileSync(path.join(root, 'sub', 'inner.txt'), 'two');
    writeFileSync(path.join(root, 'outer.txt'), 'two');

    const result = await readChangeSet(path.join(root, 'sub'));
    expect(pathsOf(result)).toEqual(['inner.txt']);
  });
});

// The guard that decides whether an answer from another machine becomes the tab's payload. Kept beside
// the real-repository cases because it is the boundary the same result crosses, not a separate feature.
describe('isChangeSetResult', () => {
  const fileRecord: DiffFile = {
    path: 'a.txt', additions: 1, deletions: 0,
    hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: 'added', number: 1, jump: 1, text: 'a' }] }],
  };

  it('accepts the three results a read can produce', () => {
    expect(isChangeSetResult({ kind: 'not-repository' })).toBe(true);
    expect(isChangeSetResult({ kind: 'error', reason: 'git diff failed' })).toBe(true);
    expect(isChangeSetResult({ kind: 'files', files: [fileRecord] })).toBe(true);
    expect(isChangeSetResult({ kind: 'files', files: [] })).toBe(true);
  });

  it('refuses an error result whose reason is not a string', () => {
    expect(isChangeSetResult({ kind: 'error' })).toBe(false);
    expect(isChangeSetResult({ kind: 'error', reason: 42 })).toBe(false);
  });

  it('refuses a files result whose list is not one, or whose records are not', () => {
    expect(isChangeSetResult({ kind: 'files' })).toBe(false);
    expect(isChangeSetResult({ kind: 'files', files: 'a.txt' })).toBe(false);
    expect(isChangeSetResult({ kind: 'files', files: [{}] })).toBe(false);
    expect(isChangeSetResult({ kind: 'files', files: [{ ...fileRecord, additions: 'one' }] })).toBe(false);
  });

  it('refuses a kind outside the three, and anything not an object', () => {
    expect(isChangeSetResult({ kind: 'changes' })).toBe(false);
    for (const value of [undefined, null, 0, 'files', [], true]) {
      expect(isChangeSetResult(value)).toBe(false);
    }
  });
});
