import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useFileNavigatorSearch } from './useFileNavigatorSearch';

function makeRows(): FileNavigatorRow[] {
  return [{ path: 'src/a.ts', name: 'a.ts', depth: 1, dir: false }];
}

function setup(request: () => Promise<unknown>, rows: FileNavigatorRow[] = makeRows()) {
  const client = { send: vi.fn(), request: vi.fn(request) } as unknown as JanusClient;
  const setSelected = vi.fn();
  const focusTree = vi.fn();
  const view = renderHook(() => useFileNavigatorSearch(client, 3, rows, setSelected, focusTree));
  return { ...view, client, setSelected, focusTree };
}

describe('useFileNavigatorSearch', () => {
  it('opens on an empty query and loads the project file list', async () => {
    const { result, client } = setup(() => Promise.resolve({ paths: ['src/a.ts', 'src/b.ts'] }));

    act(() => { result.current.openSearch(); });
    expect(result.current.searchOpen).toBe(true);
    expect(result.current.searchLoading).toBe(true);
    expect(client.request).toHaveBeenCalledWith({ method: 'fileNavigatorSearch', params: { index: 3 } });

    await act(async () => { await Promise.resolve(); });

    expect(result.current.searchLoading).toBe(false);
    expect(result.current.searchPaths).toEqual(['src/a.ts', 'src/b.ts']);
  });

  // `request` resolves `undefined` when the socket is not open, when the connection ended before the
  // reply, and when the server answered with an error. Reading `result.paths` off that threw inside
  // the `.then`, leaving the pop-up on its loading state with no way back but reopening it.
  it('clears loading and shows nothing when the request goes unanswered', async () => {
    const { result } = setup(() => Promise.resolve(undefined));

    act(() => { result.current.openSearch(); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.searchLoading).toBe(false);
    expect(result.current.searchPaths).toEqual([]);
    expect(result.current.searchOpen).toBe(true);
  });

  it('closes and returns focus to the tree', () => {
    const { result, focusTree } = setup(() => Promise.resolve({ paths: [] }));
    act(() => { result.current.openSearch(); });

    act(() => { result.current.closeSearch(); });

    expect(result.current.searchOpen).toBe(false);
    expect(focusTree).toHaveBeenCalled();
  });

  it('revealing a path asks the server for it and closes the pop-up', () => {
    const { result, client } = setup(() => Promise.resolve({ paths: ['src/a.ts'] }));
    act(() => { result.current.openSearch(); });

    act(() => { result.current.revealFromSearch('src/a.ts'); });

    expect(client.send).toHaveBeenCalledWith({
      method: 'revealFileNavigatorItem', params: { index: 3, relPath: 'src/a.ts' },
    });
    expect(result.current.searchOpen).toBe(false);
  });

  // The reveal target is consumed only once its row exists: the server rebuild that adds the
  // target's ancestor directories can arrive after the render that asked for it.
  it('selects a revealed path once its row appears in the tree', () => {
    const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: [] })) } as unknown as JanusClient;
    const setSelected = vi.fn();
    const { result, rerender } = renderHook(
      ({ rows }: { rows: FileNavigatorRow[] }) => useFileNavigatorSearch(client, 3, rows, setSelected, vi.fn()),
      { initialProps: { rows: [] as FileNavigatorRow[] } },
    );

    act(() => { result.current.revealFromSearch('src/new.ts'); });
    expect(setSelected).not.toHaveBeenCalled();

    rerender({ rows: [{ path: 'src/new.ts', name: 'new.ts', depth: 1, dir: false }] });

    expect(setSelected).toHaveBeenCalledWith('src/new.ts');
  });
});
