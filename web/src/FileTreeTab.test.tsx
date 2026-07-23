import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { FileTreeView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';
import { Sidebar } from './Sidebar';
import type { CommandInputDropHandle } from './CommandInput';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeFiles(overrides: Partial<FileTreeView> = {}): FileTreeView {
  return {
    root: '/home/user/project',
    absoluteRoot: '/home/user/project',
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

  it('renders a git-changed row with the files-name--changed class and leaves clean rows without it', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const files = makeFiles({
      rows: [
        { path: 'src', name: 'src', depth: 0, dir: true, expanded: true, gitStatus: 'changed' },
        { path: 'src/index.ts', name: 'index.ts', depth: 1, dir: false, gitStatus: 'changed' },
        { path: 'README.md', name: 'README.md', depth: 0, dir: false },
      ],
    });
    render(<FileTreeTab files={files} client={client} index={0} />);
    expect(screen.getByText('index.ts').className).toContain('files-name--changed');
    expect(screen.getByText('src').className).toContain('files-name--changed');
    expect(screen.getByText('README.md').className).not.toContain('files-name--changed');
  });

  it('renders staged rows green and conflicted rows red', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const files = makeFiles({
      rows: [
        { path: 'staged.txt', name: 'staged.txt', depth: 0, dir: false, gitStatus: 'staged' },
        { path: 'conflict.txt', name: 'conflict.txt', depth: 0, dir: false, gitStatus: 'conflict' },
      ],
    });
    render(<FileTreeTab files={files} client={client} index={0} />);
    expect(screen.getByText('staged.txt').className).toContain('files-name--staged');
    expect(screen.getByText('conflict.txt').className).toContain('files-name--conflict');
  });

  it('renders the branch name in .files-branch when present', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles({ branch: 'main' })} client={client} index={0} />);
    const branchEl = container.querySelector('.files-branch');
    expect(branchEl).not.toBeNull();
    expect(branchEl!.textContent).toBe('main');
  });

  it('renders no .files-branch element when branch is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-branch')).toBeNull();
  });

  it('renders a .files-github button when githubUrl is present', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(
      <FileTreeTab files={makeFiles({ githubUrl: 'https://github.com/owner/repo/commits/main/' })} client={client} index={0} />,
    );
    expect(container.querySelector('.files-github')).not.toBeNull();
  });

  it('renders no .files-github element when githubUrl is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-github')).toBeNull();
  });

  it('renders a "Looking for" banner and no rows while waitingFor is set', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(
      <FileTreeTab files={makeFiles({ rows: [], waitingFor: '/home/user/project/not-yet-there' })} client={client} index={0} />,
    );
    const banner = container.querySelector('.files-waiting');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('/home/user/project/not-yet-there');
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(0);
  });

  it('renders no .files-waiting banner when waitingFor is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-waiting')).toBeNull();
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

  it('shows opener choices for an unsupported file and edits it when chosen', async () => {
    const send = vi.fn();
    const request = vi.fn().mockResolvedValue({ choices: [
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ] });
    const client = { send, request } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: 'data.xyz', name: 'data.xyz', depth: 0, dir: false }] });
    render(<FileTreeTab files={files} client={client} index={3} />);
    fireEvent.dblClick(screen.getByText('data.xyz'));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Open data.xyz' })).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit as text'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit data.xyz' } });
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

  describe('rename', () => {
    const selectReadme = (tree: Element) => {
      fireEvent.keyDown(tree, { key: 'r' }); // type-ahead selects README.md
    };

    it('Cmd+R on a selected file opens an editable field pre-filled with its name', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('README.md');
    });

    it('Ctrl+R works the same as Cmd+R', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', ctrlKey: true });
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('Enter with a changed name sends renameFileTreeItem and closes the field', async () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container, rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'renamed.md{Enter}');
      expect(send).toHaveBeenCalledWith({ method: 'renameFileTreeItem', params: { index: 2, relPath: 'README.md', newName: 'renamed.md' } });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      const renamedFiles = makeFiles({ rows: makeFiles().rows.map((row) => row.path === 'README.md' ? { ...row, path: 'renamed.md', name: 'renamed.md' } : row) });
      rerender(<FileTreeTab files={renamedFiles} client={client} index={2} />);
      expect(screen.getByText('renamed.md').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(tree);
    });

    it('Enter with no change sends nothing', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(send).not.toHaveBeenCalled();
    });

    it('Escape cancels without sending', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(send).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('blur cancels without sending', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      fireEvent.blur(input);
      expect(send).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('the chord on the ".." row does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
      const { container } = render(<FileTreeTab files={files} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('the chord with no row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('committing a name colliding with a visible sibling opens MoveConflictDialog', async () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'src{Enter}');
      expect(send).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('Overwrite on the rename conflict dialog sends the RPC', async () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={4} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'src{Enter}');
      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
      expect(send).toHaveBeenCalledWith({ method: 'renameFileTreeItem', params: { index: 4, relPath: 'README.md', newName: 'src' } });
    });

    it('Cancel on the rename conflict dialog reopens the edit field', async () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'src{Enter}');
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
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

    it('dragging over a sibling command bar (docked sidebar mount) highlights it via dropRef instead of a tree row', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const dropHandle: CommandInputDropHandle = { insertAtCaret: vi.fn(), setDropHighlighted: vi.fn() };
      const dropRef = { current: dropHandle };
      const tab: TabView = {
        label: 'files', number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
        busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
        bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
        view: 'files', dock: 'left', files: makeFiles(),
      };
      const { container } = render(<Sidebar side="left" tabs={[tab]} client={client} dropRef={dropRef} />);
      const bar = document.createElement('div');
      bar.dataset.commandBar = '';
      document.body.append(bar);
      document.elementFromPoint = vi.fn().mockReturnValue(bar);

      const readmeRow = [...container.querySelectorAll('[role="treeitem"]')].find((el) => el.textContent === 'README.md')!;
      fireEvent.mouseDown(readmeRow, { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(dropHandle.setDropHighlighted).toHaveBeenCalledWith(true);
      expect(container.querySelectorAll('.drop-target')).toHaveLength(0);

      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });
      bar.remove();
    });
  });

  describe('new file', () => {
    it('New file button renders with the tooltip', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('New file')).toBeInTheDocument();
    });

    it('clicking New file with a directory row selected dispatches newfile inside that directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('src'));
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile src/untitled.md' } });
    });

    it('clicking New file with a file row selected dispatches newfile in its containing directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('index.ts'));
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile src/untitled.md' } });
    });

    it('clicking New file with no row selected dispatches newfile at the tree root', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile untitled.md' } });
    });

    it('Cmd+N while focused dispatches the same new-file command', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'n', metaKey: true });
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile untitled.md' } });
    });

    it('Ctrl+N while focused dispatches the same new-file command', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'n', ctrlKey: true });
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile untitled.md' } });
    });

    it('Cmd+N does not fall through to the window handler', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      const nativeEvent = fireEvent.keyDown(tree, { key: 'n', metaKey: true });
      expect(nativeEvent).toBe(false); // preventDefault() was called
    });
  });

  describe('new directory', () => {
    it('New directory button renders with the tooltip', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('New directory')).toBeInTheDocument();
    });

    it('creates inside a selected directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('src'));
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir src/untitled' } });
    });

    it("creates in a selected file's containing directory", () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('index.ts'));
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir src/untitled' } });
    });

    it('creates at the tree root when nothing is selected', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir untitled' } });
    });

    it('selects and opens the rename field once the created directory appears in files.rows', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withNewDir = makeFiles({
        rows: [...makeFiles().rows, { path: 'untitled', name: 'untitled', depth: 0, dir: true }],
      });
      rerender(<FileTreeTab files={withNewDir} client={client} index={0} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('untitled');
    });

    it('does nothing when an unrelated row appears instead', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withOtherFile = makeFiles({
        rows: [...makeFiles().rows, { path: 'other.txt', name: 'other.txt', depth: 0, dir: false }],
      });
      rerender(<FileTreeTab files={withOtherFile} client={client} index={0} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('does nothing when the actual created name differs from the guess (collision)', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withRenamedDir = makeFiles({
        rows: [...makeFiles().rows, { path: 'untitled-2', name: 'untitled-2', depth: 0, dir: true }],
      });
      rerender(<FileTreeTab files={withRenamedDir} client={client} index={0} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
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

  describe('search', () => {
    it('the Search files button renders with its tooltip', () => {
      const client = { send: vi.fn(), request: vi.fn(() => new Promise(() => { /* never resolves */ })) } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('Search files')).toBeInTheDocument();
    });

    it('clicking Search files opens the pop-up showing Searching… before the list resolves, then matches after', async () => {
      const { promise, resolve } = withResolvers<{ paths: string[] }>();
      const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      expect(screen.getByText('Searching…')).toBeInTheDocument();
      await act(async () => { resolve({ paths: ['src/index.ts', 'README.md'] }); await promise; });
      fireEvent.change(screen.getByPlaceholderText('Find file…'), { target: { value: 'index' } });
      expect(screen.getByText('> src/index.ts')).toBeInTheDocument();
    });

    it('shows (no matching files) for a non-matching query and Enter is a no-op', async () => {
      const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: ['README.md'] })) } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      const input = screen.getByPlaceholderText('Find file…');
      fireEvent.change(input, { target: { value: 'zzz' } });
      expect(screen.getByText('(no matching files)')).toBeInTheDocument();
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByPlaceholderText('Find file…')).toBeInTheDocument();
    });

    it('Escape closes the pop-up and returns focus to the tree', async () => {
      const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: ['README.md'] })) } as unknown as JanusClient;
      const { container } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      expect(container.querySelector('[role="tree"]')).toHaveFocus();
    });

    it('Tab accepts the ghost completion into the input without closing the pop-up', async () => {
      const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: ['src/index.ts'] })) } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      const input = screen.getByPlaceholderText('Find file…');
      fireEvent.change(input, { target: { value: 'index' } });
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(screen.getByPlaceholderText('Find file…')).toHaveValue('index.ts');
      expect(screen.getByPlaceholderText('Find file…')).toBeInTheDocument();
    });

    it('selecting a match sends revealFileTreeItem and selects the row once it appears', async () => {
      const send = vi.fn();
      const client = { send, request: vi.fn(() => Promise.resolve({ paths: ['src/index.ts'] })) } as unknown as JanusClient;
      const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      fireEvent.change(screen.getByPlaceholderText('Find file…'), { target: { value: 'index' } });
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Enter' });
      expect(send).toHaveBeenCalledWith({ method: 'revealFileTreeItem', params: { index: 0, relPath: 'src/index.ts' } });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      rerender(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByText('index.ts').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
    });

    it('a reply that arrives after the pop-up is closed does not reopen or repopulate it', async () => {
      const { promise, resolve } = withResolvers<{ paths: string[] }>();
      const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
      render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      await act(async () => { resolve({ paths: ['README.md'] }); await promise; });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
    });
  });
});

// `Promise.withResolvers` (ES2024) predates this project's `lib` target; a small typed shim keeps
// the tests off the disallowed "extract resolver from `new Promise()`" pattern regardless.
function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}
