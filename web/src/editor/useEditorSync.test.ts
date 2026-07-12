import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EditorState } from './model';
import type { JanusClient } from '../ws';
import { useEditorSync } from './useEditorSync';

function makeState(text: string, cursorCol = 0): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: cursorCol }, anchor: null };
}

function makeClient() {
  const editorSync = vi.fn();
  return { client: { editorSync } as unknown as JanusClient, editorSync };
}

describe('useEditorSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not sync on the initial load', () => {
    const { client, editorSync } = makeClient();
    renderHook(() => useEditorSync(makeState('const x = 1;'), '/open/1', client));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(editorSync).not.toHaveBeenCalled();
  });

  it('syncs once after a pause across multiple rapid changes', () => {
    const { client, editorSync } = makeClient();
    const { rerender } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', client),
      { initialProps: { state: makeState('a') } },
    );
    rerender({ state: makeState('ab') });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ state: makeState('abc') });
    act(() => { vi.advanceTimersByTime(200); });
    expect(editorSync).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(500); });
    expect(editorSync).toHaveBeenCalledTimes(1);
    expect(editorSync).toHaveBeenCalledWith('/open/1', 'abc');
  });

  it('does not sync when only the cursor moved', () => {
    const { client, editorSync } = makeClient();
    const { rerender } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', client),
      { initialProps: { state: makeState('hello', 0) } },
    );
    rerender({ state: makeState('hello', 3) });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(editorSync).not.toHaveBeenCalled();
  });

  it('cancels the pending sync on unmount', () => {
    const { client, editorSync } = makeClient();
    const { rerender, unmount } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', client),
      { initialProps: { state: makeState('a') } },
    );
    rerender({ state: makeState('ab') });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(editorSync).not.toHaveBeenCalled();
  });
});
