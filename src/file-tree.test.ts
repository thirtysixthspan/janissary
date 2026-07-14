import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readDirSorted, buildRows, isSameOrDescendantPath, hasNameConflict } from './file-tree.js';

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
