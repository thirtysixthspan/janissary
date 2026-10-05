import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EditorState } from './model';
import type { JanusClient } from '../ws';
import { useEditorSync } from './useEditorSync';

function makeState(text: string, cursorCol = 0): EditorState {
  return { lines: text.split('\n'), cursor: { line: 0, col: cursorCol }, anchor: null };
}

function makeClient() {
  const editorSync = vi.fn().mockResolvedValue({ ok: true, value: 'ok' });
  let listener: (phase: 'connected' | 'reconnecting') => void = () => {};
  const unsubscribe = vi.fn(() => { listener = () => {}; });
  const client = {
    editorSync, connectionStatus: 'connected',
    onConnectionStatus: (next: typeof listener) => { listener = next; return unsubscribe; },
  } as unknown as JanusClient;
  return { client, editorSync, unsubscribe, connection: (phase: 'connected' | 'reconnecting') => listener(phase) };
}

describe('useEditorSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
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

  it('sends edits made offline when reconnected without further typing', async () => {
    const h = makeClient();
    const { rerender } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', h.client),
      { initialProps: { state: makeState('a') } },
    );
    act(() => { h.connection('reconnecting'); });
    rerender({ state: makeState('offline edit') });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(h.editorSync).not.toHaveBeenCalled();
    await act(async () => { h.connection('connected'); });
    expect(h.editorSync).toHaveBeenCalledExactlyOnceWith('/open/1', 'offline edit');
  });

  it('resends an unacknowledged draft on reconnect', async () => {
    const h = makeClient();
    h.editorSync.mockResolvedValueOnce({ ok: false });
    const { rerender } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', h.client),
      { initialProps: { state: makeState('a') } },
    );
    rerender({ state: makeState('draft') });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => { h.connection('reconnecting'); h.connection('connected'); });
    expect(h.editorSync.mock.calls).toEqual([['/open/1', 'draft'], ['/open/1', 'draft']]);
  });

  it('resynchronizes the latest draft when its URL changes', async () => {
    const h = makeClient();
    h.editorSync.mockImplementationOnce(() => new Promise(() => {}));
    const { rerender } = renderHook(
      ({ state, url }: { state: EditorState; url: string }) => useEditorSync(state, url, h.client),
      { initialProps: { state: makeState('a'), url: '/open/1' } },
    );
    rerender({ state: makeState('draft'), url: '/open/1' });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    rerender({ state: makeState('latest'), url: '/open/2' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(h.editorSync.mock.calls).toEqual([['/open/1', 'draft'], ['/open/2', 'latest']]);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
  });

  it('moves draft delivery and the subscription to a replacement client', async () => {
    const first = makeClient();
    const second = makeClient();
    const { rerender } = renderHook(
      ({ state, client }: { state: EditorState; client: JanusClient }) => useEditorSync(state, '/open/1', client),
      { initialProps: { state: makeState('a'), client: first.client } },
    );
    rerender({ state: makeState('draft'), client: first.client });
    rerender({ state: makeState('draft'), client: second.client });
    await act(async () => { first.connection('connected'); await vi.advanceTimersByTimeAsync(1000); });
    expect(first.editorSync).not.toHaveBeenCalled();
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(second.editorSync).toHaveBeenCalledExactlyOnceWith('/open/1', 'draft');
  });

  it('unsubscribes before a later reconnection can send after unmount', async () => {
    const h = makeClient();
    const { rerender, unmount } = renderHook(
      ({ state }: { state: EditorState }) => useEditorSync(state, '/open/1', h.client),
      { initialProps: { state: makeState('a') } },
    );
    act(() => { h.connection('reconnecting'); });
    rerender({ state: makeState('draft') });
    unmount();
    await act(async () => { h.connection('connected'); await vi.advanceTimersByTimeAsync(1000); });
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(h.editorSync).not.toHaveBeenCalled();
  });
});
