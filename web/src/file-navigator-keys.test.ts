import { describe, it, expect } from 'vitest';
import { handleFileNavigatorKey, typeAheadMatch } from './file-navigator-keys';
import type { FileNavigatorRow } from '@shared/protocol';

function row(path: string, overrides: Partial<FileNavigatorRow> = {}): FileNavigatorRow {
  const depth = path.split('/').length - 1;
  return { path, name: path.split('/').pop()!, depth, dir: false, ...overrides };
}

// A tree:
// src/            (expanded)
//   nested/        (collapsed)
//   index.ts
// README.md
const rows: FileNavigatorRow[] = [
  row('src', { dir: true, expanded: true }),
  row('src/nested', { dir: true, expanded: false }),
  row('src/index.ts'),
  row('README.md'),
];

describe('handleFileNavigatorKey — selection movement', () => {
  it('ArrowDown moves to the next visible row', () => {
    expect(handleFileNavigatorKey(rows, 'src', 'ArrowDown', false, 10).selection).toBe('src/nested');
  });

  it('ArrowDown clamps at the last row', () => {
    expect(handleFileNavigatorKey(rows, 'README.md', 'ArrowDown', false, 10).selection).toBe('README.md');
  });

  it('ArrowUp moves to the previous visible row', () => {
    expect(handleFileNavigatorKey(rows, 'src/index.ts', 'ArrowUp', false, 10).selection).toBe('src/nested');
  });

  it('ArrowUp clamps at the first row', () => {
    expect(handleFileNavigatorKey(rows, 'src', 'ArrowUp', false, 10).selection).toBe('src');
  });

  it('Home selects the first row', () => {
    expect(handleFileNavigatorKey(rows, 'README.md', 'Home', false, 10).selection).toBe('src');
  });

  it('End selects the last row', () => {
    expect(handleFileNavigatorKey(rows, 'src', 'End', false, 10).selection).toBe('README.md');
  });

  it('PageDown moves selection by the page size, clamped', () => {
    expect(handleFileNavigatorKey(rows, 'src', 'PageDown', false, 2).selection).toBe('src/index.ts');
    expect(handleFileNavigatorKey(rows, 'src', 'PageDown', false, 100).selection).toBe('README.md');
  });

  it('PageUp moves selection by the page size, clamped', () => {
    expect(handleFileNavigatorKey(rows, 'README.md', 'PageUp', false, 2).selection).toBe('src/nested');
    expect(handleFileNavigatorKey(rows, 'README.md', 'PageUp', false, 100).selection).toBe('src');
  });

  it('defaults to selecting the first row when nothing was selected', () => {
    expect(handleFileNavigatorKey(rows, null, 'ArrowDown', false, 10).selection).toBe('src/nested');
  });

  it('returns a null selection for an empty row list', () => {
    expect(handleFileNavigatorKey([], null, 'ArrowDown', false, 10).selection).toBeNull();
  });
});

describe('handleFileNavigatorKey — expand/collapse/parent', () => {
  it('ArrowRight on a collapsed dir toggles it open, selection stays', () => {
    const result = handleFileNavigatorKey(rows, 'src/nested', 'ArrowRight', false, 10);
    expect(result.selection).toBe('src/nested');
    expect(result.action).toEqual({ type: 'toggle', path: 'src/nested' });
  });

  it('ArrowRight on an expanded dir reroots to that directory', () => {
    const result = handleFileNavigatorKey(rows, 'src', 'ArrowRight', false, 10);
    expect(result.selection).toBe('src');
    expect(result.action).toEqual({ type: 'reroot', path: 'src' });
  });

  it('ArrowRight on a file opens it', () => {
    const result = handleFileNavigatorKey(rows, 'README.md', 'ArrowRight', false, 10);
    expect(result.selection).toBe('README.md');
    expect(result.action).toEqual({ type: 'open', path: 'README.md' });
  });

  it('ArrowLeft on an expanded dir collapses it', () => {
    const result = handleFileNavigatorKey(rows, 'src', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('src');
    expect(result.action).toEqual({ type: 'toggle', path: 'src' });
  });

  it('ArrowLeft on a child moves selection to its parent directory', () => {
    const result = handleFileNavigatorKey(rows, 'src/index.ts', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('src');
    expect(result.action).toBeUndefined();
  });

  it('ArrowLeft on a top-level row with no parent is a no-op', () => {
    const flat: FileNavigatorRow[] = [row('a.txt'), row('b.txt')];
    const result = handleFileNavigatorKey(flat, 'a.txt', 'ArrowLeft', false, 10);
    expect(result.selection).toBe('a.txt');
    expect(result.action).toBeUndefined();
  });
});

describe('handleFileNavigatorKey — activation', () => {
  it('Enter on a directory toggles it', () => {
    const result = handleFileNavigatorKey(rows, 'src/nested', 'Enter', false, 10);
    expect(result.action).toEqual({ type: 'toggle', path: 'src/nested' });
  });

  it('Enter on a file opens it', () => {
    const result = handleFileNavigatorKey(rows, 'README.md', 'Enter', false, 10);
    expect(result.action).toEqual({ type: 'open', path: 'README.md' });
  });

  it('Shift+Enter on a file edits it', () => {
    const result = handleFileNavigatorKey(rows, 'README.md', 'Enter', true, 10);
    expect(result.action).toEqual({ type: 'edit', path: 'README.md' });
  });

  it('Space behaves like Enter', () => {
    const result = handleFileNavigatorKey(rows, 'README.md', ' ', false, 10);
    expect(result.action).toEqual({ type: 'open', path: 'README.md' });
  });

  it('Enter on ".." reroots', () => {
    const rowsWithDotdot: FileNavigatorRow[] = [
      row('..', { dir: true }),
      ...rows,
    ];
    const result = handleFileNavigatorKey(rowsWithDotdot, '..', 'Enter', false, 10);
    expect(result.action).toEqual({ type: 'reroot', path: '..' });
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
