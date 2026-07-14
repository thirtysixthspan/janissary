import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { FileTreeView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeFiles(overrides: Partial<FileTreeView> = {}): FileTreeView {
  return {
    root: '/home/user/project',
    rows: [
      { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
      { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
      { path: 'README.md', name: 'README.md', depth: 0, dir: false },
    ],
    ...overrides,
  };
}

describe('FileTreeTab', () => {
  it('renders rows with indentation, chevrons on dirs, aria-expanded/aria-selected', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
    expect(srcRow.getAttribute('aria-expanded')).toBe('true');
    expect(srcRow.style.paddingLeft).toBe('12px');
    const fileRow = screen.getByText('index.ts').closest('[role="treeitem"]') as HTMLElement;
    expect(fileRow.style.paddingLeft).toBe('28px');
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
    expect(screen.getByText('README.md').closest('[role="treeitem"]')!.getAttribute('aria-expanded')).toBeNull();
  });

  it('click on a directory row selects but does not toggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
    fireEvent.click(screen.getByText('src'));
    expect(send).not.toHaveBeenCalled();
  });

  it('double-click on a directory row sends fileTreeToggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
    fireEvent.dblClick(screen.getByText('src'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeToggle', params: { index: 2, path: 'src' } });
  });

  it('single click on a file row selects but does not open', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.click(screen.getByText('README.md'));
    expect(send).not.toHaveBeenCalled();
  });

  it('double-click on a file row sends an open command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('index.ts'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open src/index.ts' } });
  });

  it('Shift+double-click on a file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('index.ts'), { shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit src/index.ts' } });
  });

  it('double-click on a markdown file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit README.md' } });
  });

  it('Shift+double-click on a markdown file row sends an open command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'), { shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open README.md' } });
  });

  it('collapse-all button sends fileTreeCollapseAll', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={1} />);
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeCollapseAll', params: { index: 1 } });
  });

  it('double-click on ".." row sends fileTreeReroot', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }, ...makeFiles().rows] })} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('..'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeReroot', params: { index: 0 } });
  });

  it('ArrowDown moves selection and Enter opens the selected file', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' }); // no selection yet -> defaults to src (index 0), moves to src/index.ts
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open src/index.ts' } });
  });

  it('ArrowRight on a collapsed dir sends fileTreeToggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: 'src', name: 'src', depth: 0, dir: true }] });
    const { container } = render(<FileTreeTab files={files} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeToggle', params: { index: 0, path: 'src' } });
  });

  it('Enter on ".." row sends fileTreeReroot', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
    const { container } = render(<FileTreeTab files={files} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeReroot', params: { index: 0 } });
  });

  it('Shift+Enter on a file sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit README.md' } });
  });

  it('type-ahead jumps to a matching row', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'r' });
    expect(screen.getByText('README.md').closest('[role="treeitem"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('resets selected to first row when selected row disappears', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const files1 = makeFiles();
    rerender(<FileTreeTab files={files1} client={client} index={0} />);
    const files2 = makeFiles({ rows: files1.rows.slice(1) });
    rerender(<FileTreeTab files={files2} client={client} index={0} />);
  });

  it('dock-cycle button is hidden when the navigator is in a center tab', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    expect(screen.queryByTitle('Move to left sidebar')).toBeNull();
    expect(screen.queryByTitle('Move to right sidebar')).toBeNull();
  });

  it('dock-cycle button from left sends setDock to right', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} dock="left" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 0, dock: 'right' } });
  });

  it('dock-cycle button from right sends setDock to left', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} dock="right" />);
    fireEvent.click(screen.getByTitle('Move to left sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 0, dock: 'left' } });
  });

  it('autoFocus defaults to true (center mount) and can be suppressed for sidebar mounts', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    focusSpy.mockClear();
    render(<FileTreeTab files={makeFiles()} client={client} index={0} autoFocus={false} />);
    expect(focusSpy).not.toHaveBeenCalled();
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  describe('delete', () => {
    it('Backspace with a row selected opens the delete dialog with that row\'s name', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.getByText('Delete "README.md"?')).toBeInTheDocument();
    });

    it('Delete key opens the delete dialog the same way', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Delete' });
      expect(screen.getByText('Delete "README.md"?')).toBeInTheDocument();
    });

    it('Backspace/Delete with the ".." row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
      const { container } = render(<FileTreeTab files={files} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('Backspace/Delete with no row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('confirming the dialog sends deleteFileTreeItem with the selected path and closes the dialog', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={3} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      expect(send).toHaveBeenCalledWith({ method: 'deleteFileTreeItem', params: { index: 3, relPath: 'README.md' } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('cancelling the dialog sends nothing and closes the dialog', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(send).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });

  describe('drag to move', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('dragging a file over a directory row highlights it as the drop target', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(srcRow.className).toContain('drop-target');
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });
    });

    it('dragging a file over another file row highlights that file\'s parent directory instead', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const indexRow = screen.getByText('index.ts').closest('[role="treeitem"]') as HTMLElement;
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(indexRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(indexRow.className).not.toContain('drop-target');
      expect(srcRow.className).toContain('drop-target');
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });
    });

    it('drop released over a file row moves the dragged item into that file\'s parent directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
      const indexRow = screen.getByText('index.ts').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(indexRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params: { index: 2, fromRelPath: 'README.md', toRelPath: 'src' } });
    });

    it('dragging a file renders a ghost label with its name that follows the cursor', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(screen.getByText('README.md', { selector: '.files-drag-ghost' })).toBeInTheDocument();

      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(screen.queryByText('README.md', { selector: '.files-drag-ghost' })).toBeNull();
    });

    it('drop on a valid directory sends moveFileTreeItem with the right paths', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(send).toHaveBeenCalledWith({ method: 'moveFileTreeItem', params: { index: 2, fromRelPath: 'README.md', toRelPath: 'src' } });
    });

    it('drop on a conflicting name renders MoveConflictDialog instead of sending immediately', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({
        rows: [
          { path: 'src', name: 'src', depth: 0, dir: true, expanded: true },
          { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false },
          { path: 'dest', name: 'dest', depth: 0, dir: true, expanded: true },
          { path: 'dest/index.ts', name: 'index.ts', depth: 1, dir: false },
        ],
      });
      const { container } = render(<FileTreeTab files={files} client={client} index={0} />);
      const destRow = screen.getByText('dest').closest('[role="treeitem"]') as HTMLElement;
      const draggedRow = container.querySelector('[data-path="src/index.ts"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(destRow);

      fireEvent.mouseDown(draggedRow, { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(send).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  describe('undo/redo', () => {
    it('Cmd+Z sends undoFileTreeItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'undoFileTreeItem', params: { index: 2 } });
    });

    it('Ctrl+Z sends undoFileTreeItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', ctrlKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'undoFileTreeItem', params: { index: 0 } });
    });

    it('Cmd+Shift+Z sends redoFileTreeItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={1} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true, shiftKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'redoFileTreeItem', params: { index: 1 } });
    });

    it('Ctrl+Shift+Z sends redoFileTreeItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', ctrlKey: true, shiftKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'redoFileTreeItem', params: { index: 0 } });
    });

    it('a conflict response from undo opens MoveConflictDialog', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('confirming an undo conflict retries undoFileTreeItem with overwrite', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={4} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });

      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));

      expect(send).toHaveBeenCalledWith({ method: 'undoFileTreeItem', params: { index: 4, overwrite: true } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('confirming a redo conflict retries redoFileTreeItem with overwrite', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'README.md', toRelPath: 'dest' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={5} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true, shiftKey: true }); });

      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));

      expect(send).toHaveBeenCalledWith({ method: 'redoFileTreeItem', params: { index: 5, overwrite: true } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('cancelling a conflict leaves it unmoved and closes the dialog without sending anything', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(send).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('all four undo/redo chords are intercepted while other Cmd/Ctrl chords still fall through', () => {
      const send = vi.fn();
      const request = vi.fn().mockResolvedValue({});
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;

      for (const event of [
        { key: 'z', metaKey: true },
        { key: 'z', ctrlKey: true },
        { key: 'z', metaKey: true, shiftKey: true },
        { key: 'z', ctrlKey: true, shiftKey: true },
      ]) {
        const nativeEvent = fireEvent.keyDown(tree, event);
        expect(nativeEvent).toBe(false); // preventDefault() was called
      }

      // A different Cmd chord (tab-management) is not intercepted: no undo/redo RPC fires for it.
      fireEvent.keyDown(tree, { key: 'w', metaKey: true });
      expect(request).toHaveBeenCalledTimes(4);
    });
  });
});
