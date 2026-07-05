import { describe, it, expect } from 'vitest';
import { handleFileTreeKey, typeAheadMatch } from './file-tree-keys';
import type { FileTreeRow } from '@shared/protocol';

function row(path: string, overrides: Partial<FileTreeRow> = {}): FileTreeRow {
  const depth = path.split('/').length - 1;
  return { path, name: path.split('/').pop()!, depth, dir: false, ...overrides };
}

// A tree:
// src/            (expanded)
//   nested/        (collapsed)
//   index.ts
// README.md
const rows: FileTreeRow[] = [
  row('src', { dir: true, expanded: true }),
  row('src/nested', { dir: true, expanded: false }),
  row('src/index.ts'),
  row('README.md'),
];

describe('handleFileTreeKey — selection movement', () => {
  it('ArrowDown moves to the next visible row', () => {
    expect(handleFileTreeKey(rows, 'src', 'ArrowDown', false, 10).selection).toBe('src/nested');
  });

  it('ArrowDown clamps at the last row', () => {
    expect(handleFileTreeKey(rows, 'README.md', 'ArrowDown', false, 10).selection).toBe('README.md');
  });

  it('ArrowUp moves to the previous visible row', () => {
    expect(handleFileTreeKey(rows, 'src/index.ts', 'ArrowUp', false, 10).selection).toBe('src/nested');
  });

  it('ArrowUp clamps at the first row', () => {
    expect(handleFileTreeKey(rows, 'src', 'ArrowUp', false, 10).selection).toBe('src');
  });

  it('Home selects the first row', () => {
    expect(handleFileTreeKey(rows, 'README.md', 'Home', false, 10).selection).toBe('src');
  });

  it('End selects the last row', () => {
    expect(handleFileTreeKey(rows, 'src', 'End', false, 10).selection).toBe('README.md');
  });

  it('PageDown moves selection by the page size, clamped', () => {
    expect(handleFileTreeKey(rows, 'src', 'PageDown', false, 2).selection).toBe('src/index.ts');
    expect(handleFileTreeKey(rows, 'src', 'PageDown', false, 100).selection).toBe('README.md');
  });

  it('PageUp moves selection by the page size, clamped', () => {
    expect(handleFileTreeKey(rows, 'README.md', 'PageUp', false, 2).selection).toBe('src/nested');
    expect(handleFileTreeKey(rows, 'README.md', 'PageUp', false, 100).selection).toBe('src');
  });

  it('defaults to selecting the first row when nothing was selected', () => {
    expect(handleFileTreeKey(rows, null, 'ArrowDown', false, 10).selection).toBe('src/nested');
  });

  it('returns a null selection for an empty row list', () => {
    expect(handleFileTreeKey([], null, 'ArrowDown', false, 10).selection).toBeNull();
  });
});

describe('handleFileTreeKey — expand/collapse/parent', () => {
  it('ArrowRight on a collapsed dir toggles it open, selection stays', () => {
    const result = handleFileTreeKey(rows, 'src/nested', 'ArrowRight', false, 10);
    expect(result.selection).toBe('src/nested');
    expect(result.action).toEqual({ type: 'toggle', path: 'src/nested' });
  });

  it('ArrowRight on an expanded dir moves to its first child', () => {
    const result = handleFileTreeKey(rows, 'src', 'ArrowRight', false, 10);
    expect(result.selection).toBe('src/nested');
    expect(result.action).toBeUndefined();
  });

  it('ArrowRight on a file is a no-op', () => {
    const result = handleFileTreeKey(rows, 'README.md', 'ArrowRight', false, 10);
    expect(result.selection).toBe('README.md');
    expect(result.action).toBeUndefined();
  });

  it('ArrowLeft on an expanded dir collapses it', () => {
    const result = handleFileTreeKey(rows, 'src', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('src');
    expect(result.action).toEqual({ type: 'toggle', path: 'src' });
  });

  it('ArrowLeft on a child moves selection to its parent directory', () => {
    const result = handleFileTreeKey(rows, 'src/index.ts', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('src');
    expect(result.action).toBeUndefined();
  });

  it('ArrowLeft on a top-level row with no parent is a no-op', () => {
    const flat: FileTreeRow[] = [row('a.txt'), row('b.txt')];
    const result = handleFileTreeKey(flat, 'a.txt', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('a.txt');
    expect(result.action).toBeUndefined();
  });
});

describe('handleFileTreeKey — activation', () => {
  it('Enter on a directory toggles it', () => {
    const result = handleFileTreeKey(rows, 'src/nested', 'Enter', false, 10);
    expect(result.action).toEqual({ type: 'toggle', path: 'src/nested' });
  });

  it('Enter on a file opens it', () => {
    const result = handleFileTreeKey(rows, 'README.md', 'Enter', false, 10);
    expect(result.action).toEqual({ type: 'open', path: 'README.md' });
  });

  it('Shift+Enter on a file edits it', () => {
    const result = handleFileTreeKey(rows, 'README.md', 'Enter', true, 10);
    expect(result.action).toEqual({ type: 'edit', path: 'README.md' });
  });

  it('Space behaves like Enter', () => {
    const result = handleFileTreeKey(rows, 'README.md', ' ', false, 10);
    expect(result.action).toEqual({ type: 'open', path: 'README.md' });
  });
});

describe('typeAheadMatch', () => {
  it('matches the next row whose name starts with the buffer, case-insensitively', () => {
    expect(typeAheadMatch(rows, 'read')).toBe('README.md');
    expect(typeAheadMatch(rows, 'IND')).toBe('src/index.ts');
  });

  it('returns null for an empty buffer or no match', () => {
    expect(typeAheadMatch(rows, '')).toBeNull();
    expect(typeAheadMatch(rows, 'zzz')).toBeNull();
  });
});
