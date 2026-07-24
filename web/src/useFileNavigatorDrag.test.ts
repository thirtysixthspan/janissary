import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileTreeRow } from '@shared/protocol';
import type { JanusClient } from './ws';
import { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { CommandInputDropHandle } from './CommandInput';

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

function makeCommandBarElement(): HTMLElement {
  const bar = document.createElement('div');
  bar.dataset.commandBar = '';
  document.body.append(bar);
  return bar;
}

function makeDropHandle(): CommandInputDropHandle {
  return { insertAtCaret: vi.fn(), setDropHighlighted: vi.fn() };
}

describe('useFileNavigatorDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('does not start a drag for a small movement below the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 })); });

    expect(result.current.draggedPath).toBeNull();
  });

  it('starts a drag once movement passes the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 3));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toEqual({ fromRelPath: 'notes.txt', toRelPath: 'dest', source: 'move' });
  });

  it('confirmOverwrite sends the move and clears the pending conflict', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { result.current.cancelConflict(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toBeNull();
  });

  it('a window blur during an active drag cancels it without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new Event('blur')); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTarget).toBeNull();
    expect(result.current.dragPosition).toBeNull();
  });

  it('a window blur after a drag has already ended does not affect subsequent gestures', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { globalThis.dispatchEvent(new Event('blur')); });

    expect(client.send).toHaveBeenCalledTimes(1);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('notes.txt');
    expect(result.current.dropTarget).toEqual({ path: 'other', conflict: false });
  });

  it('pressing Escape during an active drag cancels it without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTarget).toBeNull();
    expect(result.current.dragPosition).toBeNull();
  });

  it("a keydown that isn't Escape does not cancel an active drag", () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });

    expect(result.current.draggedPath).toBe('notes.txt');
  });

  it('pressing Escape with no active drag does nothing', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));

    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
  });

  it('a release with no valid target resets drag state without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    document.elementFromPoint = vi.fn().mockReturnValue(null);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTarget).toBeNull();
  });

  describe('drop onto the command bar', () => {
    it('a drag released over the command-bar marker inserts the path relative to the file tree root instead of sending moveFileTreeItem', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropHandle = makeDropHandle();
      const dropRef = { current: dropHandle };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      const bar = makeCommandBarElement();
      document.elementFromPoint = vi.fn().mockReturnValue(bar);

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileTreeRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(dropHandle.insertAtCaret).toHaveBeenCalledWith('src/notes.txt');
      expect(client.send).not.toHaveBeenCalled();
    });

    it('hovering the command-bar marker highlights it and unhighlighting on move-away clears it', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropHandle = makeDropHandle();
      const dropRef = { current: dropHandle };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      const bar = makeCommandBarElement();
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(bar);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(dropHandle.setDropHighlighted).toHaveBeenLastCalledWith(true);

      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 0 })); });

      expect(dropHandle.setDropHighlighted).toHaveBeenLastCalledWith(false);
      act(() => { result.current.drop(); });
    });

    it('a drag released over a tree row still moves the file as before, unaffected by the command-bar wiring', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 3, dropRef));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });

    it('a release over neither a row nor the command bar is a no-op', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      document.elementFromPoint = vi.fn().mockReturnValue(null);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).not.toHaveBeenCalled();
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });

    it('a drag over where the command bar would be finds no marker when no CommandInput is mounted (e.g. a harness tab)', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      // No [data-command-bar] element exists anywhere — elementFromPoint returns a plain, unrelated element.
      const plain = document.createElement('div');
      document.body.append(plain);
      document.elementFromPoint = vi.fn().mockReturnValue(plain);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileTreeRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(dropRef.current.setDropHighlighted).not.toHaveBeenCalledWith(true);
      expect(result.current.dropTarget).toBeNull();

      act(() => { result.current.drop(); });

      expect(client.send).not.toHaveBeenCalled();
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });
  });
});
