import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FileTreeRow } from '../types.js';
import { readDirSorted, buildRows, markGitStatus, isSameOrDescendantPath, hasNameConflict } from './index.js';

describe('readDirSorted', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-tree-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('lists directories before files, case-insensitive alpha within each', () => {
    mkdirSync(path.join(root, 'Zeta'));
    mkdirSync(path.join(root, 'alpha'));
    writeFileSync(path.join(root, 'Banana.txt'), '');
    writeFileSync(path.join(root, 'apple.txt'), '');
    const entries = readDirSorted(root);
    expect(entries.map((e) => e.name)).toEqual(['alpha', 'Zeta', 'apple.txt', 'Banana.txt']);
    expect(entries.map((e) => e.dir)).toEqual([true, true, false, false]);
  });

  it('excludes .git, .DS_Store, and other VS Code default excludes', () => {
    mkdirSync(path.join(root, '.git'));
    writeFileSync(path.join(root, '.DS_Store'), '');
    writeFileSync(path.join(root, 'keep.txt'), '');
    expect(readDirSorted(root).map((e) => e.name)).toEqual(['keep.txt']);
  });

  it('shows other dotfiles', () => {
    writeFileSync(path.join(root, '.env'), '');
    expect(readDirSorted(root).map((e) => e.name)).toContain('.env');
  });

  it('reports a symlinked directory as a file (never expandable)', () => {
    const target = path.join(root, 'realdir');
    mkdirSync(target);
    symlinkSync(target, path.join(root, 'linked'));
    const entry = readDirSorted(root).find((e) => e.name === 'linked');
    expect(entry?.dir).toBe(false);
  });

  it('returns an empty array for an unreadable directory', () => {
    expect(readDirSorted(path.join(root, 'nope'))).toEqual([]);
  });
});

describe('buildRows', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-tree-rows-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('collapsed root yields only depth-0 rows', () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    writeFileSync(path.join(root, 'README.md'), '');
    const rows = buildRows(root, new Set());
    expect(rows).toEqual([
      { path: '..', name: '..', depth: 0, dir: true },
      { path: 'src', name: 'src', depth: 0, dir: true, expanded: false },
      { path: 'README.md', name: 'README.md', depth: 0, dir: false },
    ]);
  });

  it("expanding a nested dir yields its children at the right depth, in document order", () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'index.ts'), '');
    mkdirSync(path.join(root, 'src', 'nested'));
    writeFileSync(path.join(root, 'src', 'nested', 'deep.ts'), '');
    const rows = buildRows(root, new Set(['src']));
    expect(rows.map((r) => r.path)).toEqual(['..', 'src', 'src/nested', 'src/index.ts']);
    expect(rows.find((r) => r.path === 'src/nested')?.depth).toBe(1);
  });

  it('skips expanded paths that no longer exist', () => {
    writeFileSync(path.join(root, 'file.txt'), '');
    const rows = buildRows(root, new Set(['gone']));
    expect(rows.map((r) => r.path)).toEqual(['..', 'file.txt']);
  });
});

describe('markGitStatus', () => {
  it('marks a changed file and every ancestor directory — including collapsed ones — and leaves others unmarked', () => {
    const rows: FileTreeRow[] = [
      { path: '..', name: '..', depth: 0, dir: true },
      { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
      { path: 'src/deep', name: 'deep', depth: 1, dir: true, expanded: false },
      { path: 'src/other.ts', name: 'other.ts', depth: 1, dir: false },
      { path: 'docs', name: 'docs', depth: 0, dir: true, expanded: false },
    ];
    const marked = markGitStatus(rows, new Map([['src/deep/nested/changed.ts', 'changed']]));
    const status = Object.fromEntries(marked.map((r) => [r.path, r.gitStatus]));
    expect(status['src']).toBe('changed');
    expect(status['src/deep']).toBe('changed');
    expect(status['src/other.ts']).toBeUndefined();
    expect(status['docs']).toBeUndefined();
    expect(status['..']).toBeUndefined();
  });

  it('marks a file row with its own path\'s status', () => {
    const rows: FileTreeRow[] = [{ path: 'a.txt', name: 'a.txt', depth: 0, dir: false }];
    expect(markGitStatus(rows, new Map([['a.txt', 'staged']]))[0].gitStatus).toBe('staged');
  });

  it('does not color a directory that merely shares a name prefix with a changed path', () => {
    const rows: FileTreeRow[] = [{ path: 'src', name: 'src', depth: 0, dir: true, expanded: false }];
    expect(markGitStatus(rows, new Map([['src-backup/x.ts', 'changed']]))[0].gitStatus).toBeUndefined();
  });

  it('returns the rows unchanged when the status map is empty', () => {
    const rows: FileTreeRow[] = [{ path: 'a.txt', name: 'a.txt', depth: 0, dir: false }];
    expect(markGitStatus(rows, new Map())).toBe(rows);
  });

  it('marks a directory row with the highest-priority status among its descendants', () => {
    const rows: FileTreeRow[] = [{ path: 'src', name: 'src', depth: 0, dir: true, expanded: true }];
    const statuses = new Map<string, 'changed' | 'staged' | 'conflict'>([
      ['src/a.txt', 'changed'],
      ['src/b.txt', 'conflict'],
      ['src/c.txt', 'staged'],
    ]);
    expect(markGitStatus(rows, statuses)[0].gitStatus).toBe('conflict');
  });
});

describe('isSameOrDescendantPath', () => {
  it('is true for the same path', () => {
    expect(isSameOrDescendantPath('src', 'src')).toBe(true);
  });

  it('is true for a nested descendant', () => {
    expect(isSameOrDescendantPath('src/nested', 'src')).toBe(true);
  });

  it('is false for an unrelated sibling', () => {
    expect(isSameOrDescendantPath('other', 'src')).toBe(false);
  });

  it('is false for a path that merely shares a name prefix', () => {
    expect(isSameOrDescendantPath('src-backup', 'src')).toBe(false);
  });
});

describe('hasNameConflict', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'file-tree-conflict-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('is true when the destination already has an entry with that name', () => {
    writeFileSync(path.join(root, 'notes.txt'), '');
    expect(hasNameConflict(root, 'notes.txt')).toBe(true);
  });

  it('is false when the destination has no entry with that name', () => {
    expect(hasNameConflict(root, 'notes.txt')).toBe(false);
  });
});
