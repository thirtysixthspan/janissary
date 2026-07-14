import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useFileTreeDrag } from './useFileTreeDrag';

function makeRows(): FileTreeRow[] {
  return [
    { path: 'notes.txt', name: 'notes.txt', depth: 0, dir: false },
    { path: 'dest', name: 'dest', depth: 0, dir: true, expanded: true },
    { path: 'dest/notes.txt', name: 'notes.txt', depth: 1, dir: false },
    { path: 'other', name: 'other', depth: 0, dir: true, expanded: true },
  ];
}

function makeRowElement(path: string): HTMLElement {
  const row = document.createElement('div');
  row.dataset.path = path;
  document.body.append(row);
  return row;
}

function downEvent(x: number, y: number) {
  return { preventDefault: vi.fn(), clientX: x, clientY: y } as unknown as React.MouseEvent;
}

describe('useFileTreeDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('does not start a drag for a small movement below the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 })); });

    expect(result.current.draggedPath).toBeNull();
  });

  it('starts a drag once movement passes the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('notes.txt');
    expect(result.current.dropTarget).toEqual({ path: 'other', conflict: false });
    expect(result.current.dragPosition).toEqual({ x: 20, y: 0 });
  });

  it('updates dragPosition on further movement and clears it on drop', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 35, clientY: 10 })); });

    expect(result.current.dragPosition).toEqual({ x: 35, y: 10 });

    act(() => { result.current.drop(); });

    expect(result.current.dragPosition).toBeNull();
  });

  it('drop() sends moveFileTreeItem directly for a valid non-conflicting target', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 3));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('drop() opens the conflict flow instead of sending immediately for a conflicting target', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toEqual({ fromRelPath: 'notes.txt', toRelPath: 'dest' });
  });

  it('confirmOverwrite sends the move and clears the pending conflict', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { result.current.confirmOverwrite(); });

    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params: { index: 0, fromRelPath: 'notes.txt', toRelPath: 'dest' } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('cancelConflict clears the pending conflict without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { result.current.cancelConflict(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toBeNull();
  });

  it('a release with no valid target resets drag state without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileTreeDrag(makeRows(), client, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(null);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTarget).toBeNull();
  });
});
