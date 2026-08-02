import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditorFind } from './useEditorFind';

const LINES = ['const alpha = 1;', '  }', 'function beta() {', '  }'];

function openWith(lines: string[], query: string) {
  const view = renderHook(({ l, a }: { l: string[]; a: boolean }) => useEditorFind(l, a), {
    initialProps: { l: lines, a: true },
  });
  act(() => { view.result.current.open(); });
  act(() => { view.result.current.setQuery(query); });
  return view;
}

describe('useEditorFind', () => {
  it('starts closed and yields no results for an empty query', () => {
    const { result } = renderHook(() => useEditorFind(LINES, true));
    expect(result.current.findOpen).toBe(false);
    expect(result.current.results).toEqual([]);

    act(() => { result.current.open(); });

    expect(result.current.findOpen).toBe(true);
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
  });

  it('returns matching lines ranked best-first', () => {
    const { result } = openWith(LINES, 'beta');
    expect(result.current.results.map((r) => r.path)).toEqual(['function beta() {']);
  });

  it('caps the results at ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => `alpha line ${i}`);
    const { result } = openWith(many, 'alpha');
    expect(result.current.results).toHaveLength(10);
  });

  it('keeps two identical lines apart by their line number', () => {
    const { result } = openWith(LINES, '}');
    expect(result.current.results.map((r) => r.index)).toEqual([1, 3]);
  });

  it('resets the selection to the top when the query changes', () => {
    const { result } = openWith(LINES, 'a');
    act(() => { result.current.setSelected(2); });
    expect(result.current.selected).toBe(2);

    act(() => { result.current.setQuery('beta'); });

    expect(result.current.selected).toBe(0);
  });

  it('clamps the selection when the buffer shrinks under it', () => {
    const { result, rerender } = renderHook(({ l, a }: { l: string[]; a: boolean }) => useEditorFind(l, a), {
      initialProps: { l: LINES, a: true },
    });
    act(() => { result.current.open(); });
    act(() => { result.current.setQuery('}'); });
    act(() => { result.current.setSelected(1); });
    expect(result.current.selected).toBe(1);

    rerender({ l: ['  }'], a: true });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.selected).toBe(0);
  });

  it('re-filters against new buffer content while open', () => {
    const { result, rerender } = renderHook(({ l, a }: { l: string[]; a: boolean }) => useEditorFind(l, a), {
      initialProps: { l: LINES, a: true },
    });
    act(() => { result.current.open(); });
    act(() => { result.current.setQuery('gamma'); });
    expect(result.current.results).toEqual([]);

    rerender({ l: [...LINES, 'const gamma = 3;'], a: true });

    expect(result.current.results.map((r) => r.path)).toEqual(['const gamma = 3;']);
  });

  it('closes when the tab goes inactive', () => {
    const { result, rerender } = renderHook(({ l, a }: { l: string[]; a: boolean }) => useEditorFind(l, a), {
      initialProps: { l: LINES, a: true },
    });
    act(() => { result.current.open(); });
    expect(result.current.findOpen).toBe(true);

    rerender({ l: LINES, a: false });

    expect(result.current.findOpen).toBe(false);
  });

  it('yields no results while the file is still loading', () => {
    const { result } = renderHook(() => useEditorFind(null, true));
    act(() => { result.current.open(); });
    act(() => { result.current.setQuery('alpha'); });

    expect(result.current.findOpen).toBe(true);
    expect(result.current.results).toEqual([]);
  });
});
