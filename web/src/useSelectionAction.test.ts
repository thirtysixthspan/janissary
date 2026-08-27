import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from './ws';
import { useSelectionAction } from './useSelectionAction';

const OFFERED = { label: 'Add to playlist', action: 'queue' };

function makeClient(reply?: unknown) {
  const request = vi.fn(async () => reply === undefined ? OFFERED : reply);
  const send = vi.fn();
  return { client: { request, send } as unknown as JanusClient, request, send };
}

function deferred<T>() {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

describe('useSelectionAction', () => {
  it('queries for a menu opened on a row inside a multi-row selection', async () => {
    const { client, request } = makeClient();
    const { result } = renderHook(() => useSelectionAction(client, 3));

    await act(async () => { result.current.query(['a.mp3', 'b.mp3']); });

    expect(request).toHaveBeenCalledWith({
      method: 'fileNavigatorSelectionAction', params: { index: 3, paths: ['a.mp3', 'b.mp3'] },
    });
    expect(result.current.entry).toEqual({ label: 'Add to playlist', action: 'queue' });
  });

  it('issues no request at all for a single-row menu', async () => {
    const { client, request } = makeClient();
    const { result } = renderHook(() => useSelectionAction(client, 0));

    await act(async () => { result.current.query(['a.mp3']); });

    expect(request).not.toHaveBeenCalled();
    expect(result.current.entry).toBeNull();
  });

  it('clears a previous entry when the next menu resolves to nothing', async () => {
    const { client } = makeClient(null);
    const { result } = renderHook(() => useSelectionAction(client, 0));

    await act(async () => { result.current.query(['a.mp3', 'cover.png']); });

    expect(result.current.entry).toBeNull();
  });

  it('ignores an older reply that resolves after the current query', async () => {
    const first = deferred<typeof OFFERED>();
    const second = deferred<typeof OFFERED>();
    const request = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = { request, send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useSelectionAction(client, 0));

    act(() => {
      result.current.query(['first.mp3', 'second.mp3']);
      result.current.query(['third.mp3', 'fourth.mp3']);
    });
    await act(async () => { second.resolve({ label: 'Current action', action: 'current' }); });
    await act(async () => { first.resolve({ label: 'Stale action', action: 'stale' }); });

    expect(result.current.entry).toEqual({ label: 'Current action', action: 'current' });
  });

  it('ignores a pending reply after the menu action is cleared', async () => {
    const pending = deferred<typeof OFFERED>();
    const client = { request: vi.fn(() => pending.promise), send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useSelectionAction(client, 0));

    act(() => {
      result.current.query(['first.mp3', 'second.mp3']);
      result.current.clear();
    });
    await act(async () => { pending.resolve(OFFERED); });

    expect(result.current.entry).toBeNull();
  });

  it('sends back the same paths and the action the server just offered', async () => {
    const { client, send } = makeClient();
    const { result } = renderHook(() => useSelectionAction(client, 2));
    await act(async () => { result.current.query(['a.mp3', 'b.mp3']); });

    act(() => { result.current.run(['a.mp3', 'b.mp3']); });

    expect(send).toHaveBeenCalledWith({
      method: 'runFileNavigatorSelectionAction',
      params: { index: 2, paths: ['a.mp3', 'b.mp3'], action: 'queue' },
    });
  });

  it('sends nothing when no entry was offered', () => {
    const { client, send } = makeClient();
    const { result } = renderHook(() => useSelectionAction(client, 0));

    act(() => { result.current.run(['a.mp3', 'b.mp3']); });

    expect(send).not.toHaveBeenCalled();
  });
});
