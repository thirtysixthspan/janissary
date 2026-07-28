import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FileNavigatorRow } from '@shared/protocol';
import {
  normalizeOperationPaths,
  rangeSelection,
  reconcileSelection,
  replaceRenamedPath,
  replaceSelection,
  selectFromPointer,
  toggleSelection,
  useFileNavigatorSelection,
} from './useFileNavigatorSelection';

const rows = (paths: string[]): FileNavigatorRow[] =>
  paths.map((path) => ({ path, name: path.split('/').at(-1)!, depth: path.split('/').length - 1, dir: !path.includes('.') }));

describe('file navigator selection transitions', () => {
  it('replaces, toggles, and gives Shift precedence over toggle', () => {
    const visible = rows(['a', 'b', 'c']);
    const initial = replaceSelection('a');
    expect([...toggleSelection(initial, 'b').selected]).toEqual(['a', 'b']);
    expect([...selectFromPointer(initial, visible, 'c', true, true).selected]).toEqual(['a', 'b', 'c']);
  });

  it('uses the clicked row as an empty range anchor and excludes parent rows', () => {
    expect([...rangeSelection(replaceSelection(null), rows(['..', 'a', 'b']), 'b').selected]).toEqual(['b']);
    expect([...rangeSelection(replaceSelection('a'), rows(['..', 'a', 'b']), '..').selected]).toEqual(['..']);
  });

  it('normalizes in visible order, removing duplicates and selected descendants', () => {
    const visible = rows(['..', 'dir', 'dir/a.txt', 'z.txt']);
    expect(normalizeOperationPaths(visible, new Set(['z.txt', 'dir/a.txt', 'dir', '..']))).toEqual(['dir', 'z.txt']);
  });

  it('replaces a renamed path throughout the state', () => {
    const state = { cursor: 'a', anchor: 'a', selected: new Set(['a', 'b']) };
    const renamed = replaceRenamedPath(state, 'a', 'c');
    expect(renamed).toEqual({ cursor: 'c', anchor: 'c', selected: new Set(['b', 'c']) });
  });

  it('prunes hidden rows and prefers a visible ancestor for the cursor', () => {
    const state = { cursor: 'dir/a.txt', anchor: 'dir/a.txt', selected: new Set(['dir', 'dir/a.txt', 'z.txt']) };
    expect(reconcileSelection(state, rows(['dir', 'dir/a.txt', 'z.txt']), rows(['dir', 'z.txt']))).toEqual({
      cursor: 'dir',
      anchor: 'dir',
      selected: new Set(['dir', 'z.txt']),
    });
  });

  it('falls back to the former row index when no ancestor survives', () => {
    const state = { cursor: 'b', anchor: 'b', selected: new Set(['b']) };
    expect(reconcileSelection(state, rows(['a', 'b', 'c']), rows(['a', 'c'])).cursor).toBe('c');
  });

  it('clears cursor, anchor, and selection when the absolute root changes', () => {
    const visible = rows(['a', 'b']);
    const { result, rerender } = renderHook(
      ({ root }) => useFileNavigatorSelection(visible, root),
      { initialProps: { root: '/one' } },
    );
    act(() => { result.current.replace('a'); });
    expect(result.current.cursor).toBe('a');
    rerender({ root: '/two' });
    expect(result.current.cursor).toBeNull();
    expect(result.current.anchor).toBeNull();
    expect(result.current.selected.size).toBe(0);
  });
});
