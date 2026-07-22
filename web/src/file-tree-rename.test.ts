import { describe, it, expect } from 'vitest';
import { computeRename, hasRenameCollision, defaultRenameSelection } from './file-tree-rename';

describe('computeRename', () => {
  it('is a no-op when the name is unchanged', () => {
    expect(computeRename('src/notes.txt', 'notes.txt')).toEqual({ type: 'noop' });
  });

  it('is a no-op for an empty name', () => {
    expect(computeRename('src/notes.txt', '')).toEqual({ type: 'noop' });
  });

  it('is a no-op for a whitespace-only name', () => {
    expect(computeRename('src/notes.txt', ' '.repeat(3))).toEqual({ type: 'noop' });
  });

  it('computes the new relative path in the same directory for a genuine change', () => {
    expect(computeRename('src/notes.txt', 'renamed.txt')).toEqual({ type: 'rename', newPath: 'src/renamed.txt' });
  });

  it('computes a root-level new path when the original had no parent directory', () => {
    expect(computeRename('notes.txt', 'renamed.txt')).toEqual({ type: 'rename', newPath: 'renamed.txt' });
  });
});

describe('hasRenameCollision', () => {
  it('reports true when the new name matches a sibling', () => {
    expect(hasRenameCollision('renamed.txt', ['renamed.txt', 'other.txt'])).toBe(true);
  });

  it('reports false when the new name matches no sibling', () => {
    expect(hasRenameCollision('renamed.txt', ['other.txt'])).toBe(false);
  });
});

describe('defaultRenameSelection', () => {
  it('selects the basename without extension for a file', () => {
    expect(defaultRenameSelection('notes.txt', false)).toEqual({ start: 0, end: 5 });
  });

  it('selects the whole name for a file with no extension', () => {
    expect(defaultRenameSelection('README', false)).toEqual({ start: 0, end: 6 });
  });

  it('selects the whole name for a directory', () => {
    expect(defaultRenameSelection('src', true)).toEqual({ start: 0, end: 3 });
  });

  it('does not treat a leading dot as an extension separator', () => {
    expect(defaultRenameSelection('.gitignore', false)).toEqual({ start: 0, end: 10 });
  });
});
