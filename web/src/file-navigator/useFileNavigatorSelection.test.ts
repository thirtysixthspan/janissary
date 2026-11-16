import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FileNavigatorRestoreHint, FileNavigatorRow } from '@shared/protocol';
import {
  normalizeOperationPaths,
  rangeSelection,
  reconcileSelection,
  replaceRenamedPath,
  replaceSelection,
  selectFromPointer,
  selectionFromRestore,
  toggleSelection,
} from './file/navigator-selection';
import {
  useFileNavigatorSelection,
} from './useFileNavigatorSelection';
import { collectNavigatorSelections } from './file/navigator-selection-registry';

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
    expect(selectionFromRestore(hint, rows(['dir', 'dir/a.txt']), { cursor: null, anchor: null, selected: new Set() })).toEqual({
      cursor: 'dir/a.txt', anchor: null, selected: new Set(['dir']),
    });
  });

  it('yields an empty selection when the hint names nothing that still exists', () => {
    const hint = { revision: 1, cursor: 'gone', anchor: 'gone', selected: ['gone'] };
    expect(selectionFromRestore(hint, rows(['a']), { cursor: null, anchor: null, selected: new Set() }))
      .toEqual({ cursor: null, anchor: null, selected: new Set() });
  });

  it('seeds cursor, anchor, and selection from the hint', () => {
    const visible = rows(['a', 'b']);
    const { result } = renderHook(() =>
      useFileNavigatorSelection(visible, '/root', 'navigator', { revision: 1, cursor: 'b', anchor: 'a', selected: ['a', 'b'] }));

    expect(result.current.cursor).toBe('b');
    expect(result.current.anchor).toBe('a');
    expect(result.current.selected).toEqual(new Set(['a', 'b']));
  });

  it('keeps a visible current anchor when a partial cursor restore changes the rows', () => {
    const expanded = rows(['src', 'src/nested', 'src/nested/a.ts', 'README.md']);
    const collapsed = rows(['src', 'README.md']);
    const initialHint: FileNavigatorRestoreHint = { revision: 0 };
    const { result, rerender } = renderHook(
      ({ visible, hint }) => useFileNavigatorSelection(visible, '/root', 'navigator', hint),
      { initialProps: { visible: expanded, hint: initialHint } },
    );
    act(() => { result.current.replace('src'); });
    act(() => { result.current.extend('src/nested/a.ts'); });

    rerender({ visible: collapsed, hint: { revision: 1, cursor: 'README.md' } });

    expect(result.current.cursor).toBe('README.md');
    expect(result.current.anchor).toBe('src');
    expect(result.current.selected).toEqual(new Set(['src']));
  });

  it('keeps a profile restore anchor null while replacing selection during a row collapse', () => {
    const expanded = rows(['src', 'src/nested', 'src/nested/a.ts', 'README.md']);
    const collapsed = rows(['src', 'README.md']);
    const initialHint: FileNavigatorRestoreHint = { revision: 0 };
    const { result, rerender } = renderHook(
      ({ visible, hint }) => useFileNavigatorSelection(visible, '/root', 'navigator', hint),
      { initialProps: { visible: expanded, hint: initialHint } },
    );
    act(() => { result.current.replace('src/nested/a.ts'); });

    rerender({
      visible: collapsed,
      hint: { revision: 1, cursor: 'README.md', anchor: null, selected: [] },
    });

    expect(result.current.cursor).toBe('README.md');
    expect(result.current.anchor).toBeNull();
    expect(result.current.selected).toEqual(new Set());
  });

  it('does not re-apply the same revision over a selection the user has since changed', () => {
    const visible = rows(['a', 'b']);
    const hint = { revision: 1, cursor: 'b', anchor: 'b', selected: ['b'] };
    const { result, rerender } = renderHook(() => useFileNavigatorSelection(visible, '/root', 'navigator', hint));
    act(() => { result.current.replace('a'); });
    expect(result.current.cursor).toBe('a');

    rerender();

    expect(result.current.cursor).toBe('a');
  });

  it('applies a hint again once its revision changes', () => {
    const visible = rows(['a', 'b']);
    const { result, rerender } = renderHook(
      ({ hint }) => useFileNavigatorSelection(visible, '/root', 'navigator', hint),
      { initialProps: { hint: { revision: 1, cursor: 'b', anchor: 'b', selected: ['b'] } } },
    );
    act(() => { result.current.replace('a'); });

    rerender({ hint: { revision: 2, cursor: 'b', anchor: 'b', selected: ['b'] } });

    expect(result.current.cursor).toBe('b');
  });
});

type RootChangeProps = {
  root: string;
  visible: FileNavigatorRow[];
  restore?: FileNavigatorRestoreHint;
};

describe('holding a focus hint until its row arrives', () => {
  it('selects the row only when it appears and reports the outcome applied then', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 2, focus: true, cursor: 'c', anchor: 'c', selected: ['c'],
    };
    const { result, rerender } = renderHook(
      ({ visible }) => useFileNavigatorSelection(visible, '/root', 'navigator', hint),
      { initialProps: { visible: rows(['a', 'b']) } },
    );

    expect(result.current.cursor).toBeNull();
    expect(result.current.focusHint).toEqual({ revision: 2, outcome: 'pending' });

    rerender({ visible: rows(['a', 'b', 'c']) });

    expect(result.current.cursor).toBe('c');
    expect(result.current.focusHint).toEqual({ revision: 2, outcome: 'applied' });
  });

  it('never applies a focus hint the user overtook and reports it dropped', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 3, focus: true, cursor: 'c', anchor: 'c', selected: ['c'],
    };
    const { result, rerender } = renderHook(
      ({ visible }) => useFileNavigatorSelection(visible, '/root', 'navigator', hint),
      { initialProps: { visible: rows(['a', 'b']) } },
    );

    act(() => { result.current.replace('a'); });

    expect(result.current.focusHint).toEqual({ revision: 3, outcome: 'dropped' });

    rerender({ visible: rows(['a', 'b', 'c']) });

    expect(result.current.cursor).toBe('a');
    expect(result.current.focusHint).toEqual({ revision: 3, outcome: 'dropped' });
  });

  it('applies an ordinary hint at once and reports no focus outcome', () => {
    const visible = rows(['a', 'b']);
    const { result } = renderHook(() => useFileNavigatorSelection(visible, '/root', 'navigator', {
      revision: 4, cursor: 'b', anchor: 'b', selected: ['b'],
    }));

    expect(result.current.cursor).toBe('b');
    expect(result.current.focusHint).toBeUndefined();
  });

  it('applies a focus hint that arrives with a root change when its row exists', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 5, focus: true, cursor: 'b', anchor: 'b', selected: ['b'],
    };
    const { result, rerender } = renderHook<ReturnType<typeof useFileNavigatorSelection>, RootChangeProps>(
      ({ root, visible, restore }) => useFileNavigatorSelection(visible, root, 'navigator', restore),
      { initialProps: { root: '/one', visible: rows(['a']), restore: undefined } },
    );

    rerender({ root: '/two', visible: rows(['a', 'b']), restore: hint });

    expect(result.current.cursor).toBe('b');
    expect(result.current.focusHint).toEqual({ revision: 5, outcome: 'applied' });
  });

  it('applies a focus hint that arrives with a root change once its row arrives', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 5, focus: true, cursor: 'b', anchor: 'b', selected: ['b'],
    };
    const { result, rerender } = renderHook<ReturnType<typeof useFileNavigatorSelection>, RootChangeProps>(
      ({ root, visible, restore }) => useFileNavigatorSelection(visible, root, 'navigator', restore),
      { initialProps: { root: '/one', visible: rows(['a']), restore: undefined } },
    );

    rerender({ root: '/two', visible: rows(['a']), restore: hint });

    expect(result.current.focusHint).toEqual({ revision: 5, outcome: 'pending' });

    rerender({ root: '/two', visible: rows(['a', 'b']), restore: hint });

    expect(result.current.cursor).toBe('b');
    expect(result.current.focusHint).toEqual({ revision: 5, outcome: 'applied' });
  });

  it('drops a pending focus hint when the root changes in a later update', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 6, focus: true, cursor: 'c', anchor: 'c', selected: ['c'],
    };
    const visible = rows(['a', 'b']);
    const { result, rerender } = renderHook(
      ({ root }) => useFileNavigatorSelection(visible, root, 'navigator', hint),
      { initialProps: { root: '/one' } },
    );

    expect(result.current.focusHint).toEqual({ revision: 6, outcome: 'pending' });

    rerender({ root: '/two' });

    expect(result.current.focusHint).toEqual({ revision: 6, outcome: 'dropped' });
    expect(result.current.cursor).toBeNull();
  });

  it('does not re-apply a focus hint revision on a later broadcast', () => {
    const hint: FileNavigatorRestoreHint = {
      revision: 7, focus: true, cursor: 'b', anchor: 'b', selected: ['b'],
    };
    const visible = rows(['a', 'b']);
    const { result, rerender } = renderHook(
      ({ restore }) => useFileNavigatorSelection(visible, '/root', 'navigator', restore),
      { initialProps: { restore: hint } },
    );

    act(() => { result.current.replace('a'); });
    rerender({ restore: { ...hint } });

    expect(result.current.cursor).toBe('a');
    expect(result.current.focusHint).toEqual({ revision: 7, outcome: 'applied' });
  });

  it('reconciles the cursor while pending before applying the hint over it', () => {
    const restored: FileNavigatorRestoreHint = {
      revision: 1, cursor: 'dir/a.txt', anchor: 'dir/a.txt', selected: ['dir/a.txt'],
    };
    const focusHint: FileNavigatorRestoreHint = {
      revision: 2, focus: true, cursor: 'later', anchor: 'later', selected: ['later'],
    };
    const { result, rerender } = renderHook(
      ({ visible, restore }: { visible: FileNavigatorRow[]; restore: FileNavigatorRestoreHint }) =>
        useFileNavigatorSelection(visible, '/root', 'navigator', restore),
      { initialProps: { visible: rows(['dir', 'dir/a.txt', 'b']), restore: restored } },
    );

    expect(result.current.cursor).toBe('dir/a.txt');

    rerender({ visible: rows(['dir', 'dir/a.txt', 'b']), restore: focusHint });

    expect(result.current.cursor).toBe('dir/a.txt');
    expect(result.current.focusHint).toEqual({ revision: 2, outcome: 'pending' });

    rerender({ visible: rows(['dir', 'b']), restore: focusHint });

    expect(result.current.cursor).toBe('dir');
    expect(result.current.focusHint).toEqual({ revision: 2, outcome: 'pending' });

    rerender({ visible: rows(['dir', 'b', 'later']), restore: focusHint });

    expect(result.current.cursor).toBe('later');
    expect(result.current.focusHint).toEqual({ revision: 2, outcome: 'applied' });
  });
});

describe('publishing a navigator selection for profile save', () => {
  it('publishes under its tab label and clears the entry on unmount', () => {
    const visible = rows(['a', 'b']);
    const { result, unmount } = renderHook(() => useFileNavigatorSelection(visible, '/root', 'navigator'));

    act(() => { result.current.replace('a'); });
    expect(collectNavigatorSelections()).toEqual([
      { label: 'navigator', cursor: 'a', anchor: 'a', selected: ['a'] },
    ]);

    unmount();
    expect(collectNavigatorSelections()).toEqual([]);
  });

  it('publishes nothing when the hook is given no tab label', () => {
    const visible = rows(['a']);
    const { result } = renderHook(() => useFileNavigatorSelection(visible, '/root'));
    act(() => { result.current.replace('a'); });
    expect(collectNavigatorSelections()).toEqual([]);
  });
});
