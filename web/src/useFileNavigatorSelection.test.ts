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
  selectionFromRestore,
  toggleSelection,
  useFileNavigatorSelection,
} from './useFileNavigatorSelection';
import { collectNavigatorSelections } from './file-navigator-selection-registry';

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

  it('extend grows a range from the anchor and shrinks it when the direction reverses', () => {
    const visible = rows(['a', 'b', 'c', 'd']);
    const { result } = renderHook(() => useFileNavigatorSelection(visible, '/root'));
    act(() => { result.current.replace('a'); });
    act(() => { result.current.extend('b'); });
    expect([...result.current.selected]).toEqual(['a', 'b']);
    act(() => { result.current.extend('c'); });
    expect([...result.current.selected]).toEqual(['a', 'b', 'c']);
    act(() => { result.current.extend('b'); });
    expect([...result.current.selected]).toEqual(['a', 'b']);
    expect(result.current.anchor).toBe('a');
    expect(result.current.cursor).toBe('b');
  });

  it('extend anchors on the top row from an empty selection and omits ".."', () => {
    const visible = rows(['..', 'a', 'b']);
    const { result } = renderHook(() => useFileNavigatorSelection(visible, '/root'));
    act(() => { result.current.extend('a'); });
    expect([...result.current.selected]).toEqual(['a']);
    act(() => { result.current.extend('b'); });
    expect([...result.current.selected]).toEqual(['a', 'b']);
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

describe('restoring a saved tree selection', () => {
  it('keeps only the paths that still have a visible row', () => {
    const hint = { revision: 1, cursor: 'dir/a.txt', anchor: 'gone', selected: ['dir', 'gone'] };
    expect(selectionFromRestore(hint, rows(['dir', 'dir/a.txt']))).toEqual({
      cursor: 'dir/a.txt', anchor: null, selected: new Set(['dir']),
    });
  });

  it('yields an empty selection when the hint names nothing that still exists', () => {
    const hint = { revision: 1, cursor: 'gone', anchor: 'gone', selected: ['gone'] };
    expect(selectionFromRestore(hint, rows(['a']))).toEqual({ cursor: null, anchor: null, selected: new Set() });
  });

  it('seeds cursor, anchor, and selection from the hint', () => {
    const visible = rows(['a', 'b']);
    const { result } = renderHook(() =>
      useFileNavigatorSelection(visible, '/root', 0, { revision: 1, cursor: 'b', anchor: 'a', selected: ['a', 'b'] }));

    expect(result.current.cursor).toBe('b');
    expect(result.current.anchor).toBe('a');
    expect(result.current.selected).toEqual(new Set(['a', 'b']));
  });

  it('does not re-apply the same revision over a selection the user has since changed', () => {
    const visible = rows(['a', 'b']);
    const hint = { revision: 1, cursor: 'b', anchor: 'b', selected: ['b'] };
    const { result, rerender } = renderHook(() => useFileNavigatorSelection(visible, '/root', 0, hint));
    act(() => { result.current.replace('a'); });
    expect(result.current.cursor).toBe('a');

    rerender();

    expect(result.current.cursor).toBe('a');
  });

  it('applies a hint again once its revision changes', () => {
    const visible = rows(['a', 'b']);
    const { result, rerender } = renderHook(
      ({ hint }) => useFileNavigatorSelection(visible, '/root', 0, hint),
      { initialProps: { hint: { revision: 1, cursor: 'b', anchor: 'b', selected: ['b'] } } },
    );
    act(() => { result.current.replace('a'); });

    rerender({ hint: { revision: 2, cursor: 'b', anchor: 'b', selected: ['b'] } });

    expect(result.current.cursor).toBe('b');
  });
});

describe('publishing a navigator selection for profile save', () => {
  it('publishes under its tab index and clears the entry on unmount', () => {
    const visible = rows(['a', 'b']);
    const { result, unmount } = renderHook(() => useFileNavigatorSelection(visible, '/root', 3));

    act(() => { result.current.replace('a'); });
    expect(collectNavigatorSelections()).toEqual([
      { index: 3, cursor: 'a', anchor: 'a', selected: ['a'] },
    ]);

    unmount();
    expect(collectNavigatorSelections()).toEqual([]);
  });

  it('publishes nothing when the hook is given no tab index', () => {
    const visible = rows(['a']);
    const { result } = renderHook(() => useFileNavigatorSelection(visible, '/root'));
    act(() => { result.current.replace('a'); });
    expect(collectNavigatorSelections()).toEqual([]);
  });
});
