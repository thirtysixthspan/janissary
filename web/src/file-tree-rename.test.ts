import { describe, it, expect } from 'vitest';
import { computeRename, hasRenameCollision, siblingNames } from './file-tree-rename';

describe('computeRename', () => {
  it('is a noop when the trimmed name equals the current basename', () => {
    expect(computeRename('src/notes.txt', '  notes.txt  ')).toEqual({ type: 'noop' });
  });

  it('is a noop for an empty or whitespace-only name', () => {
    expect(computeRename('src/notes.txt', ' '.repeat(3))).toEqual({ type: 'noop' });
    expect(computeRename('src/notes.txt', '')).toEqual({ type: 'noop' });
  });

  it('computes the new relative path in the same directory for a root-level row', () => {
    expect(computeRename('notes.txt', 'renamed.txt')).toEqual({ type: 'rename', newRelPath: 'renamed.txt' });
  });

  it('computes the new relative path in the same directory for a nested row', () => {
    expect(computeRename('src/notes.txt', 'renamed.txt')).toEqual({ type: 'rename', newRelPath: 'src/renamed.txt' });
  });

  it('trims the raw name before using it', () => {
    expect(computeRename('notes.txt', '  renamed.txt  ')).toEqual({ type: 'rename', newRelPath: 'renamed.txt' });
  });
});

describe('hasRenameCollision', () => {
  it('reports true when newName matches a sibling', () => {
    expect(hasRenameCollision('README.md', ['README.md', 'src'])).toBe(true);
  });

  it('reports false when newName has no sibling match', () => {
    expect(hasRenameCollision('unique.md', ['README.md', 'src'])).toBe(false);
  });
});

describe('siblingNames', () => {
  const rows = [
    { path: 'src', name: 'src' },
    { path: 'src/index.ts', name: 'index.ts' },
    { path: 'README.md', name: 'README.md' },
  ];

  it('returns names of rows sharing the same parent, excluding the row itself', () => {
    expect(siblingNames(rows, 'README.md')).toEqual(['src']);
  });

  it('returns nested siblings for a nested row', () => {
    expect(siblingNames(rows, 'src/index.ts')).toEqual([]);
  });
});
