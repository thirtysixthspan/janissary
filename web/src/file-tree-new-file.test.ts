import { describe, it, expect } from 'vitest';
import type { FileTreeRow } from '@shared/protocol';
import { newFileTargetDir, newFileCommand } from './file-tree-new-file';

const rows: FileTreeRow[] = [
  { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
  { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
  { path: 'README.md', name: 'README.md', depth: 0, dir: false },
  { path: '..', name: '..', depth: 0, dir: true },
];

describe('newFileTargetDir', () => {
  it('returns the directory path when a directory row is selected', () => {
    expect(newFileTargetDir(rows, 'src')).toBe('src');
  });

  it('returns the containing directory when a file row is selected', () => {
    expect(newFileTargetDir(rows, 'src/index.ts')).toBe('src');
  });

  it('returns null for a root-level file row (containing directory is the root)', () => {
    expect(newFileTargetDir(rows, 'README.md')).toBeNull();
  });

  it('returns null when no row is selected', () => {
    expect(newFileTargetDir(rows, null)).toBeNull();
  });

  it('treats the ".." row as no selection', () => {
    expect(newFileTargetDir(rows, '..')).toBeNull();
  });

  it('handles nested relative paths', () => {
    const nested: FileTreeRow[] = [
      { path: 'a', name: 'a', depth: 0, dir: true, expanded: true },
      { path: 'a/b', name: 'b', depth: 1, dir: true, expanded: true },
      { path: 'a/b/c.ts', name: 'c.ts', depth: 2, dir: false },
    ];
    expect(newFileTargetDir(nested, 'a/b/c.ts')).toBe('a/b');
    expect(newFileTargetDir(nested, 'a/b')).toBe('a/b');
  });
});

describe('newFileCommand', () => {
  it('builds the newfile command at the tree root when the target directory is null', () => {
    expect(newFileCommand(null)).toBe('newfile untitled.md');
  });

  it('builds the newfile command inside the target directory', () => {
    expect(newFileCommand('src')).toBe('newfile src/untitled.md');
  });
});
