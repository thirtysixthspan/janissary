import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from './ws';
import { useFileNavigatorMoveOperations } from './useFileNavigatorMoveOperations';

function makeClient(...results: unknown[]): JanusClient {
  return {
    send: vi.fn(),
    request: vi.fn()
      .mockImplementationOnce(() => Promise.resolve(results[0]))
      .mockImplementationOnce(() => Promise.resolve(results[1])),
  } as unknown as JanusClient;
}

describe('useFileNavigatorMoveOperations', () => {
  it('requests scalar move confirmation and retries or cancels it', () => {
    const client = makeClient();
    const { result } = renderHook(() => useFileNavigatorMoveOperations(client, 2));

    act(() => {
      result.current.requestMove(['src/report.md'], 'archive', 'archive', true);
    });
    expect(result.current.pendingConflict).toEqual({
      kind: 'scalar',
      fromRelPath: 'src/report.md',
      toRelPath: 'archive',
      source: 'move',
      title: '"report.md" already exists here. Overwrite it?',
    });

    act(() => { result.current.confirmOverwrite(); });
    expect(client.send).toHaveBeenCalledWith({
      method: 'moveFileNavigatorItem',
      params: { index: 2, fromRelPath: 'src/report.md', toRelPath: 'archive' },
    });
    expect(result.current.pendingConflict).toBeNull();

    act(() => {
      result.current.requestMove(['src/report.md'], 'archive', 'archive', true);
      result.current.cancelConflict();
    });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('requests batch move confirmation and retries with the selected policy', async () => {
    const client = makeClient({ conflictPaths: ['a.txt'] }, { total: 2, failedPaths: [] });
    const { result } = renderHook(() => useFileNavigatorMoveOperations(client, 1));

    await act(async () => {
      result.current.requestMove(['a.txt', 'b.txt'], 'archive', 'archive', false);
      await Promise.resolve();
    });
    expect(result.current.pendingConflict).toEqual({
      kind: 'batch-move',
      sourcePaths: ['a.txt', 'b.txt'],
      destinationPath: 'archive',
      title: 'Some items already exist in "archive".',
    });

    await act(async () => {
      result.current.skipConflicts();
      await Promise.resolve();
    });
    expect(client.request).toHaveBeenLastCalledWith({
      method: 'moveFileNavigatorItems',
      params: { index: 1, sourcePaths: ['a.txt', 'b.txt'], destinationPath: 'archive', policy: 'skip-conflicts' },
    });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('requests scalar history confirmation and retries the matching history RPC', async () => {
    const client = makeClient(
      { conflict: { fromRelPath: 'a.txt', toRelPath: 'archive' } },
      { total: 1, failedPaths: [] },
    );
    const { result } = renderHook(() => useFileNavigatorMoveOperations(client, 4));

    await act(async () => {
      result.current.sendUndo();
      await Promise.resolve();
    });
    expect(result.current.pendingConflict?.kind).toBe('scalar');

    await act(async () => {
      result.current.confirmOverwrite();
      await Promise.resolve();
    });
    expect(client.send).toHaveBeenCalledWith({
      method: 'undoFileNavigatorItem', params: { index: 4, overwrite: true },
    });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('requests history batch confirmation and cancels without retrying', async () => {
    const client = makeClient({ conflicts: [{ fromRelPath: 'a.txt', toRelPath: 'archive' }] });
    const { result } = renderHook(() => useFileNavigatorMoveOperations(client, 5));

    await act(async () => {
      result.current.sendRedo();
      await Promise.resolve();
    });
    expect(result.current.pendingConflict).toEqual({
      kind: 'history',
      method: 'redoFileNavigatorItem',
      title: 'Some items already exist in their destinations.',
    });

    act(() => { result.current.cancelConflict(); });
    expect(client.send).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(result.current.pendingConflict).toBeNull();
  });
});
