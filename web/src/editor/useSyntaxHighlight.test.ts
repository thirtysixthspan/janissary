import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EditorState } from './model';
import { useSyntaxHighlight } from './useSyntaxHighlight';

function makeState(text: string): EditorState {
  const lines = text.split('\n');
  return {
    lines: lines.map((t, i) => ({ text: t, number: i + 1 })),
    cursor: { row: 0, col: 0 },
    selection: null,
  } as unknown as EditorState;
}

describe('useSyntaxHighlight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty tokens for null state', () => {
    const { result } = renderHook(() => useSyntaxHighlight(null, 'test.ts'));
    expect(result.current).toEqual([]);
  });

  it('computes tokens on initial load', () => {
    const { result } = renderHook(() => useSyntaxHighlight(makeState('const x = 1;'), 'test.ts'));
    expect(result.current.length).toBeGreaterThan(0);
  });

  it('debounces recompute on subsequent state changes', () => {
    const { result, rerender } = renderHook(
      ({ state, fileName }: { state: EditorState | null; fileName: string }) =>
        useSyntaxHighlight(state, fileName),
      { initialProps: { state: makeState('const x = 1;'), fileName: 'test.ts' } },
    );
    expect(result.current.length).toBeGreaterThan(0);
    rerender({ state: makeState('const y = 2;'), fileName: 'test.ts' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.length).toBeGreaterThan(0);
  });
});
