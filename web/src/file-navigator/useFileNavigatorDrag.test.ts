import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { FileNavigatorRow } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { useFileNavigatorDrag as useFileNavigatorDragImplementation } from './useFileNavigatorDrag';
import type { CommandInputDropHandle, EditorDropHandle, HarnessDropHandle } from '../shared/drop-handles';
import { registerEditorDrop, registerHarnessDrop } from '../shared/drop-registry';

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

function makeEditorBodyElement(label: string): HTMLElement {
  const body = document.createElement('div');
  body.dataset.editorDrop = label;
  document.body.append(body);
  return body;
}

// A single-item move goes out as a request so the server can answer a conflict; this client answers
// every request with `value`, a plain successful move unless a test says otherwise.
function makeMoveClient(value?: unknown): JanusClient {
  const answer = value ?? { total: 1, failedPaths: [] };
  return { send: vi.fn(), request: vi.fn().mockResolvedValue({ ok: true, value: answer }) } as unknown as JanusClient;
}

function makeHarnessBodyElement(ptyId: string): HTMLElement {
  const body = document.createElement('div');
  body.dataset.harnessDrop = ptyId;
  document.body.append(body);
  return body;
}

function useFileNavigatorDrag(
  rows: FileNavigatorRow[], client: JanusClient,
  absoluteRootOrDropRef: string | React.RefObject<CommandInputDropHandle | null> = '',
  displayRoot = '',
  targetCwd = '',
  providedDropRef?: React.RefObject<CommandInputDropHandle | null>,
  remoteHost?: string,
) {
  const legacy = typeof absoluteRootOrDropRef !== 'string';
  return useFileNavigatorDragImplementation(rows, client, 'files', {
    absoluteRoot: legacy ? '' : absoluteRootOrDropRef,
    displayRoot,
    targetCwd,
    dropRef: legacy ? absoluteRootOrDropRef : providedDropRef,
    remoteHost,
  });
}

// Every harness and editor registration a case makes, torn down after it so the module-level
// registry never carries a handle from one case into the next.
const registeredHarnesses: (() => void)[] = [];

function registerHarness(ptyId: string): HarnessDropHandle {
  const handle = { insertAtCaret: vi.fn() };
  registeredHarnesses.push(registerHarnessDrop(ptyId, handle));
  return handle;
}

function registerEditor(label: string): EditorDropHandle {
  const handle = { insertAtCaret: vi.fn() };
  registeredHarnesses.push(registerEditorDrop(label, handle));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 1 })); });

    expect(result.current.draggedPath).toBeNull();
  });

  it('starts a drag once movement passes the threshold', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('notes.txt');
    expect(result.current.dropTarget).toEqual({ path: 'other', conflict: false });
    expect(result.current.dragPosition).toEqual({ x: 20, y: 0 });
  });

  it('updates dragPosition on further movement and clears it on drop', () => {
    const client = makeMoveClient();
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
    const client = makeMoveClient();
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });

    expect(client.request).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'other' } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('drop() opens the conflict flow instead of sending immediately for a conflicting target', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const destRow = makeRowElement('dest');
    document.elementFromPoint = vi.fn().mockReturnValue(destRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { result.current.confirmOverwrite(); });

    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'dest', overwrite: true } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('opens the conflict dialog when the server reports a conflict the loaded rows could not show', async () => {
    const client = makeMoveClient({ conflictPaths: ['notes.txt'] });
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    await act(async () => { result.current.drop(); await Promise.resolve(); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.pendingConflict).toEqual({
      kind: 'scalar',
      fromRelPath: 'notes.txt',
      toRelPath: 'other',
      source: 'move',
      title: '"notes.txt" already exists here. Overwrite it?',
    });

    act(() => { result.current.confirmOverwrite(); });
    expect(client.send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'other', overwrite: true } });
    expect(result.current.pendingConflict).toBeNull();
  });

  it('cancelConflict clears the pending conflict without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
    const client = makeMoveClient();
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { result.current.drop(); });
    act(() => { globalThis.dispatchEvent(new Event('blur')); });

    expect(client.request).toHaveBeenCalledTimes(1);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

    expect(result.current.draggedPath).toBe('notes.txt');
    expect(result.current.dropTarget).toEqual({ path: 'other', conflict: false });
  });

  it('pressing Escape during an active drag cancels it without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
    const otherRow = makeRowElement('other');
    document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

    act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
    act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });

    expect(result.current.draggedPath).toBe('notes.txt');
  });

  it('pressing Escape with no active drag does nothing', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));

    act(() => { globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

    expect(client.send).not.toHaveBeenCalled();
    expect(result.current.draggedPath).toBeNull();
  });

  it('a release with no valid target resets drag state without sending anything', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, dropRef));
      const bar = makeCommandBarElement();
      document.elementFromPoint = vi.fn().mockReturnValue(bar);

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(dropHandle.insertAtCaret).toHaveBeenCalledWith('notes.txt');
      expect(client.send).not.toHaveBeenCalled();
    });

    it('hovering the command-bar marker highlights it and unhighlighting on move-away clears it', () => {
      const client = makeMoveClient();
      const dropHandle = makeDropHandle();
      const dropRef = { current: dropHandle };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, dropRef));
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
      const client = makeMoveClient();
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, dropRef));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.request).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(dropRef.current.insertAtCaret).not.toHaveBeenCalled();
    });

    it('a release over neither a row nor the command bar is a no-op', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropRef = { current: makeDropHandle() };
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, dropRef));
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
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client, dropRef));
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
      const editor = registerEditor('notes-editor');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeEditorBodyElement('notes-editor'));

      act(() => { result.current.onRowMouseDown({ path: 'src/notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(editor.insertAtCaret).toHaveBeenCalledWith('notes.txt');
      expect(client.send).not.toHaveBeenCalled();
    });

    // Split panes can show two editors at once. The one under the pointer receives the drop, not
    // whichever of them holds focus.
    it('delivers the drop only to the editor under the pointer when two are visible', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const left = registerEditor('left-editor');
      const right = registerEditor('right-editor');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeEditorBodyElement('right-editor'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(right.insertAtCaret).toHaveBeenCalledWith('notes.txt');
      expect(left.insertAtCaret).not.toHaveBeenCalled();
    });

    it('drops nothing over an editor body whose label has no registered handle', () => {
      const client = makeMoveClient();
      const other = registerEditor('other-editor');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeEditorBodyElement('hidden-editor'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(other.insertAtCaret).not.toHaveBeenCalled();
      expect(client.request).not.toHaveBeenCalled();
      expect(client.send).not.toHaveBeenCalled();
    });

    it('hovering the editor-body marker suppresses the row drop-target highlight', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      registerEditor('notes-editor');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeEditorBodyElement('notes-editor'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(result.current.dropTarget).toBeNull();
      act(() => { result.current.drop(); });
    });

    it('a drag released over a tree row still moves the file as before, unaffected by the editor wiring', () => {
      const client = makeMoveClient();
      const editor = registerEditor('notes-editor');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.request).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(editor.insertAtCaret).not.toHaveBeenCalled();
    });
  });

  describe('drop onto a harness tab', () => {
    it('a drag released over the harness marker types the paths into that harness instead of sending moveFileNavigatorItem', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const harness = registerHarness('pty-1');
      const { result } = renderHook(() =>
        useFileNavigatorDrag(makeRows(), client, '/work/tree', 'tree', '/work'));
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
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
        useFileNavigatorDrag(makeRows(), client, '/srv/project', 'project', '/srv', undefined, 'devbox'));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-1'));

      act(() => { result.current.onRowMouseDown({ path: 'src/a.ts' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(harness.insertAtCaret).toHaveBeenCalledWith('devbox:/srv/project/src/a.ts');
    });

    it('hovering the harness marker suppresses the row drop-target highlight', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      registerHarness('pty-1');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-1'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });

      expect(result.current.dropTarget).toBeNull();
      act(() => { result.current.drop(); });
    });

    it('a release over a harness body whose PTY registered nothing changes nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      document.elementFromPoint = vi.fn().mockReturnValue(makeHarnessBodyElement('pty-unregistered'));

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.send).not.toHaveBeenCalled();
      expect(result.current.draggedPath).toBeNull();
    });

    it('a drag released over a tree row still moves the file as before, unaffected by the harness wiring', () => {
      const client = makeMoveClient();
      const harness = registerHarness('pty-1');
      const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
      const otherRow = makeRowElement('other');
      document.elementFromPoint = vi.fn().mockReturnValue(otherRow);

      act(() => { result.current.onRowMouseDown({ path: 'notes.txt' } as FileNavigatorRow, downEvent(0, 0)); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 0 })); });
      act(() => { result.current.drop(); });

      expect(client.request).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { label: 'files', fromRelPath: 'notes.txt', toRelPath: 'other' } });
      expect(harness.insertAtCaret).not.toHaveBeenCalled();
    });
  });

  it('sends a request/reply batch for multiple operation paths', () => {
    const client = {
      send: vi.fn(),
      request: vi.fn().mockResolvedValue({ total: 2, failedPaths: [] }),
    } as unknown as JanusClient;
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, '/work/tree', 'tree', '/work'));
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
        label: 'files',
        sourcePaths: ['notes.txt', 'second.txt'],
        destinationPath: 'other',
        policy: undefined,
      },
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it('inserts every selected file name with target-specific separators for a command-bar drop', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = makeDropHandle();
    const commandRef = { current: commandHandle };
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, '/work/tree', 'tree', '/work', commandRef));
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
    expect(commandHandle.insertAtCaret).toHaveBeenCalledWith('notes.txt a.ts');
    expect(client.send).not.toHaveBeenCalled();
  });

  it('inserts every selected file name once in the editor with newline separators and no cwd relativity', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const editor = registerEditor('notes-editor');
    const { result } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, '/work/tree', 'tree', '/work'));
    document.elementFromPoint = vi.fn().mockReturnValue(makeEditorBodyElement('notes-editor'));

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

    expect(editor.insertAtCaret).toHaveBeenCalledOnce();
    expect(editor.insertAtCaret).toHaveBeenCalledWith('notes.txt\na.ts');
    expect(client.send).not.toHaveBeenCalled();
  });

  // The gesture lifecycle: one disposer serves mouse-up, blur, Escape, the public drop, and
  // unmount, so a gesture can never outlive the surface that started it.

  it('unmount during a drag releases the window listeners and clears the highlight', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const commandHandle = makeDropHandle();
    const commandRef = { current: commandHandle };
    const { result, unmount } = renderHook(() =>
      useFileNavigatorDrag(makeRows(), client, '', '', '', commandRef));
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
      useFileNavigatorDrag(makeRows(), client, '', '', '', commandRef));
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
    const { result } = renderHook(() => useFileNavigatorDrag(makeRows(), client));
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
      useFileNavigatorDrag(makeRows(), client, '', '', '', commandRef));
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
