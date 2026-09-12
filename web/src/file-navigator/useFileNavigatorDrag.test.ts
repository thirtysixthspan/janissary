import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useFileNavigatorDrag } from './useFileNavigatorDrag';
import type { CommandInputDropHandle, EditorDropHandle, HarnessDropHandle } from '../drop-handles';
import { registerHarnessDrop } from '../harness-drop-registry';

function makeRows(): FileNavigatorRow[] {
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

function makeEditorDropHandle(): EditorDropHandle {
  return { insertAtCaret: vi.fn() };
}

function makeEditorBodyElement(): HTMLElement {
  const body = document.createElement('div');
  body.dataset.editorDrop = '';
  document.body.append(body);
  return body;
}

function makeHarnessBodyElement(ptyId: string): HTMLElement {
  const body = document.createElement('div');
  body.dataset.harnessDrop = ptyId;
  document.body.append(body);
  return body;
}

// Every harness registration a case makes, torn down after it so the module-level registry never
// carries a handle from one case into the next.
const registeredHarnesses: (() => void)[] = [];

function registerHarness(ptyId: string): HarnessDropHandle {
  const handle = { insertAtCaret: vi.fn() };
  registeredHarnesses.push(registerHarnessDrop(ptyId, handle));
  return handle;
}

describe('useFileNavigatorDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
    for (const unregister of registeredHarnesses) unregister();
    registeredHarnesses.length = 0;
  });

  it('does not start a drag for a small movement below the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 })); });

    expect(result.current.draggedPath).toBeNull();
  });

  it('starts a drag once movement passes the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 35, clientY: 10 })); });

    expect(result.current.dragPosition).toEqual({ x: 35, y: 10 });

    act(() => { result.current.drop(); });

    expect(result.current.dragPosition).toBeNull();
  });

  it('drop() sends moveFileNavigatorItem directly for a valid non-conflicting target', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 3));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('drop() opens the conflict flow instead of sending immediately for a conflicting target', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toEqual({
      kind: 'scalar',
      fromRelPath: 'notes.txt',
      toRelPath: 'dest',
      source: 'move',
      title: '"notes.txt" already exists here. Overwrite it?',
    });
  });

  it('confirmOverwrite sends the move and clears the pending conflict', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { result.current.confirmOverwrite(); });

    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 0, fromRelPath: 'notes.txt', toRelPath: 'dest' } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('cancelConflict clears the pending conflict without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { globalThis.dispatchEvent(new Event('blur')); });

    expect(client.send).toHaveBeenCalledTimes(1);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('notes.txt');
    expect(result.current.dropTarget).toEqual({ path: 'other', conflict: false });
  });

  it('pressing Escape during an active drag cancels it without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
    expect(result.current.dropTarget).toBeNull();
  });

  describe('drop onto the command bar', () => {
    it('a drag released over the command-bar marker inserts the path relative to the file tree root instead of sending moveFileNavigatorItem', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropHandle = makeDropHandle();
      const dropRef = { current: dropHandle };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      const bar = makeCommandBarElement();
      document.elementFromPoint = vi.fn().mockReturnValue(bar);

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });

    it('a release over neither a row nor the command bar is a no-op', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, dropRef));
      document.elementFromPoint = vi.fn().mockReturnValue(null);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
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

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(dropRef.current.setDropHighlighted).not.toHaveBeenCalledWith(true);
      expect(result.current.dropTarget).toBeNull();

      act(() => { result.current.drop(); });

      expect(client.send).not.toHaveBeenCalled();
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });
  });

  describe('drop onto an editor tab', () => {
    it('a drag released over the editor-body marker inserts the path at the cursor instead of sending moveFileNavigatorItem', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const editorDropHandle = makeEditorDropHandle();
      const editorDropRef = { current: editorDropHandle };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, undefined, editorDropRef));
      const body = makeEditorBodyElement();
      document.elementFromPoint = vi.fn().mockReturnValue(body);

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(editorDropHandle.insertAtCaret).toHaveBeenCalledWith('src/notes.txt');
      expect(client.send).not.toHaveBeenCalled();
    });

    it('hovering the editor-body marker suppresses the row drop-target highlight', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const editorDropRef = { current: makeEditorDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0, undefined, editorDropRef));
      const body = makeEditorBodyElement();
      document.elementFromPoint = vi.fn().mockReturnValue(body);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(result.current.dropTarget).toBeNull();
      act(() => { result.current.drop(); });
    });

    it('a drag released over a tree row still moves the file as before, unaffected by the editor wiring', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const editorDropRef = { current: makeEditorDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 3, undefined, editorDropRef));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(editorDropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });
  });

  describe('drop onto a harness tab', () => {
    it('a drag released over the harness marker types the paths into that harness instead of sending moveFileNavigatorItem', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const harness = registerHarness('pty-1');
      const { result } = renderHook(() =>
        useFileNavigatorDrag(makeRows(), client, 0, '/work/tree', 'tree', '/work'));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-1'));

      act(() => {
        result.current.onRowMouseDown(
          { path: 'notes.txt' } as FileNavigatorRow,
          downEvent(0, 0),
          ['notes.txt', 'src/a.ts'],
          ['notes.txt', 'src/a.ts'],
        );
      });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(harness.insertAtCaret).toHaveBeenCalledOnce();
      expect(harness.insertAtCaret).toHaveBeenCalledWith('tree/notes.txt tree/src/a.ts');
      expect(client.send).not.toHaveBeenCalled();
    });

    it('reaches the harness the pointer is over, not another mounted one', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const left = registerHarness('pty-left');
      const right = registerHarness('pty-right');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-right'));

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(right.insertAtCaret).toHaveBeenCalledWith('src/notes.txt');
      expect(left.insertAtCaret).not.toHaveBeenCalled();
    });

    it('a remote tree types host-qualified absolute paths, as it does into a command bar', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const harness = registerHarness('pty-1');
      const { result } = renderHook(() =>
        useFileNavigatorDrag(makeRows(), client, 0, '/srv/project', 'project', '/srv', undefined, undefined, 'devbox'));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-1'));

      act(() => { result.current.onRowMouseDown({ path: 'src/a.ts' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(harness.insertAtCaret).toHaveBeenCalledWith('devbox:/srv/project/src/a.ts');
    });

    it('hovering the harness marker suppresses the row drop-target highlight', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      registerHarness('pty-1');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-1'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(result.current.dropTarget).toBeNull();
      act(() => { result.current.drop(); });
    });

    it('a release over a harness body whose PTY registered nothing changes nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-unregistered'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).not.toHaveBeenCalled();
      expect(result.current.draggedPath).toBeNull();
    });

    it('a drag released over a tree row still moves the file as before, unaffected by the harness wiring', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const harness = registerHarness('pty-1');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 3));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 3, fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(harness.insertAtCaret).not.toHaveBeenCalled();
    });
  });

  it('sends a request/reply batch for multiple operation paths', () => {
    const client = {
      send: vi.fn(),
      request: vi.fn().mockResolvedValue({ total: 2, failedPaths: [] }),
    } as unknown as JanusClient;
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, 4, '/work/tree', 'tree', '/work'));
    const target = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(target);

    act(() => {
      result.current.onRowMouseDown(
        { path: 'notes.txt' } as FileNavigatorRow,
        downEvent(0, 0),
        ['notes.txt', 'second.txt'],
        ['notes.txt', 'second.txt'],
      );
    });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.request).toHaveBeenCalledWith({
      method: 'moveFileNavigatorItems',
      params: {
        index: 4,
        sourcePaths: ['notes.txt', 'second.txt'],
        destinationPath: 'other',
        policy: undefined,
      },
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('inserts every selected path once with target-specific separators and command cwd relativity', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = makeDropHandle();
    const commandRef = { current: commandHandle };
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, 0, '/work/tree', 'tree', '/work', commandRef));
    document.elementFromPoint = vi.fn().mockReturnValue(makeCommandBarElement());

    act(() => {
      result.current.onRowMouseDown(
        { path: 'notes.txt' } as FileNavigatorRow,
        downEvent(0, 0),
        ['notes.txt', 'src/a.ts'],
        ['notes.txt', 'src/a.ts'],
      );
    });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(commandHandle.insertAtCaret).toHaveBeenCalledOnce();
    expect(commandHandle.insertAtCaret).toHaveBeenCalledWith('tree/notes.txt tree/src/a.ts');
    expect(client.send).not.toHaveBeenCalled();
  });

  // The gesture lifecycle: one disposer serves mouse-up, blur, Escape, the public drop, and
  // unmount, so a gesture can never outlive the surface that started it.

  it('unmount during a drag releases the window listeners and clears the highlight', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = makeDropHandle();
    const commandRef = { current: commandHandle };
    const { result, unmount } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, 0, '', '', '', commandRef));
    document.elementFromPoint = vi.fn().mockReturnValue(makeCommandBarElement());

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    expect(commandHandle.setDropHighlighted).toHaveBeenCalledWith(true);

    unmount();
    expect(commandHandle.setDropHighlighted).toHaveBeenLastCalledWith(false);

    expect(() => {
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 0 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 0 })); });
    }).not.toThrow();
    expect(commandHandle.insertAtCaret).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  it('a direct drop() releases the window listeners, so a later mouse-up commits nothing', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = makeDropHandle();
    const commandRef = { current: commandHandle };
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, 0, '', '', '', commandRef));
    document.elementFromPoint = vi.fn().mockReturnValue(makeCommandBarElement());

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    expect(commandHandle.insertAtCaret).toHaveBeenCalledOnce();

    act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup', { clientX: 20, clientY: 0 })); });
    expect(commandHandle.insertAtCaret).toHaveBeenCalledOnce();
  });

  it('starting a second gesture releases the first gesture\'s listeners', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, 0));
    const bar = makeCommandBarElement();
    document.elementFromPoint = vi.fn().mockReturnValue(bar);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    expect(result.current.draggedPath).toBe('notes.txt');

    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);
    act(() => { result.current.onRowMouseDown({ path: 'dest/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('dest/notes.txt');
  });

  it('a throwing destination cannot retain the window listeners', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = { insertAtCaret: vi.fn(() => { throw new Error('surface closed'); }), setDropHighlighted: vi.fn() };
    const commandRef = { current: commandHandle };
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, 0, '', '', '', commandRef));
    document.elementFromPoint = vi.fn().mockReturnValue(makeCommandBarElement());

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(() => {
      act(() => { result.current.drop(); });
    }).toThrow('surface closed');
    expect(commandHandle.insertAtCaret).toHaveBeenCalledOnce();

    expect(() => {
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup', { clientX: 20, clientY: 0 })); });
    }).not.toThrow();
    expect(commandHandle.insertAtCaret).toHaveBeenCalledOnce();
  });
});
