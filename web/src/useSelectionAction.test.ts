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
