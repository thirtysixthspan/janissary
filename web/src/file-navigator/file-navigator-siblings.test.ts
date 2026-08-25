import { describe, expect, it } from 'vitest';
import type { FileNavigatorRow } from '@shared/protocol';
import { siblingSelection } from './file-navigator-siblings';
import type { FileNavigatorSelection } from './useFileNavigatorSelection';

// A tree:
// ..
// src/            (expanded)
//   nested/        (expanded)
//     deep.ts
//   index.ts
// README.md
const rows: FileNavigatorRow[] = [
  { path: '..', name: '..', depth: 0, dir: true },
  { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
  { path: 'src/nested', name: 'nested', depth: 1, dir: true, expanded: true },
  { path: 'src/nested/deep.ts', name: 'deep.ts', depth: 2, dir: false },
  { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
  { path: 'README.md', name: 'README.md', depth: 0, dir: false },
];

const state = (cursor: string | null, anchor: string | null = cursor): FileNavigatorSelection =>
  ({ cursor, anchor, selected: new Set(cursor === null ? [] : [cursor]) });

describe('siblingSelection', () => {
  it('selects the cursor row\'s siblings without pulling in an expanded subtree', () => {
    const next = siblingSelection(state('src/index.ts'), rows);
    expect([...next.selected].toSorted((a, b) => a.localeCompare(b))).toEqual(['src/index.ts', 'src/nested']);
  });

  it('leaves the cursor and anchor where they are', () => {
    const next = siblingSelection(state('src/index.ts', 'src/nested'), rows);
    expect(next.cursor).toBe('src/index.ts');
    expect(next.anchor).toBe('src/nested');
  });

  it('selects top-level siblings without the ".." row', () => {
    const next = siblingSelection(state('README.md'), rows);
    expect([...next.selected].toSorted((a, b) => a.localeCompare(b))).toEqual(['README.md', 'src']);
  });

  it('selects the only sibling of a lone child row', () => {
    const next = siblingSelection(state('src/nested/deep.ts'), rows);
    expect([...next.selected]).toEqual(['src/nested/deep.ts']);
  });

  it('returns the state untouched with no cursor', () => {
    const empty = state(null);
    expect(siblingSelection(empty, rows)).toBe(empty);
  });

  it('returns the state untouched with the cursor on ".."', () => {
    const parent = state('..');
    expect(siblingSelection(parent, rows)).toBe(parent);
  });

  it('returns the state untouched when the cursor has no visible row', () => {
    const gone = state('deleted.txt');
    expect(siblingSelection(gone, rows)).toBe(gone);
  });
});
