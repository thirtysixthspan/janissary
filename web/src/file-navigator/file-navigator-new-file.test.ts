import { describe, it, expect } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { newFileTargetDir, newFileCommand, newDirectoryCommand, newDirectoryTargetPath, findPendingNewDir } from './file-navigator-new-file';

const rows: FileNavigatorRow[] = [
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
    const nested: FileNavigatorRow[] = [
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
    expect(newFileCommand('/home/user/project', null)).toBe('newfile /home/user/project/untitled.md');
  });

  it('builds the newfile command inside the target directory', () => {
    expect(newFileCommand('/home/user/project', 'src')).toBe('newfile /home/user/project/src/untitled.md');
  });

  it('roots the target at the navigator tree, not wherever a command would otherwise resolve', () => {
    expect(newFileCommand('/Users/ash/dev/bctci', 'src')).toBe('newfile /Users/ash/dev/bctci/src/untitled.md');
  });

  it('does not double the separator when the root ends with a slash', () => {
    expect(newFileCommand('/', null)).toBe('newfile /untitled.md');
    expect(newFileCommand('/home/user/project/', 'src')).toBe('newfile /home/user/project/src/untitled.md');
  });
});

describe('newDirectoryCommand', () => {
  it('builds the newdir command at the tree root when the target directory is null', () => {
    expect(newDirectoryCommand('/home/user/project', null)).toBe('newdir /home/user/project/untitled');
  });

  it('builds the newdir command inside the target directory', () => {
    expect(newDirectoryCommand('/home/user/project', 'src')).toBe('newdir /home/user/project/src/untitled');
  });

  it('roots the target at the navigator tree, not wherever a command would otherwise resolve', () => {
    expect(newDirectoryCommand('/Users/ash/dev/bctci', 'src')).toBe('newdir /Users/ash/dev/bctci/src/untitled');
  });

  it('does not double the separator when the root ends with a slash', () => {
    expect(newDirectoryCommand('/', null)).toBe('newdir /untitled');
  });
});

describe('newDirectoryTargetPath', () => {
  it('stays tree-relative so it can be matched against row paths', () => {
    expect(newDirectoryTargetPath('src')).toBe('src/untitled');
    expect(newDirectoryTargetPath(null)).toBe('untitled');
  });

  it('guesses the root-level path when the target directory is null', () => {
    expect(newDirectoryTargetPath(null)).toBe('untitled');
  });

  it('guesses the nested path inside the target directory', () => {
    expect(newDirectoryTargetPath('src')).toBe('src/untitled');
  });
});

describe('findPendingNewDir', () => {
  it('returns undefined when there is no pending path', () => {
    expect(findPendingNewDir(rows, null)).toBeUndefined();
  });

  it('returns the matching directory row', () => {
    const withNewDir: FileNavigatorRow[] = [...rows, { path: 'untitled', name: 'untitled', depth: 0, dir: true }];
    expect(findPendingNewDir(withNewDir, 'untitled')).toEqual({ path: 'untitled', name: 'untitled', depth: 0, dir: true });
  });

  it('returns undefined when no row matches the guessed path yet', () => {
    expect(findPendingNewDir(rows, 'untitled')).toBeUndefined();
  });

  it('ignores a file row that happens to match the guessed path', () => {
    const withFile: FileNavigatorRow[] = [...rows, { path: 'untitled', name: 'untitled', depth: 0, dir: false }];
    expect(findPendingNewDir(withFile, 'untitled')).toBeUndefined();
  });
});
