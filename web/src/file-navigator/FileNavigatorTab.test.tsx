import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { FileNavigatorView, TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { FileNavigatorTab } from './FileNavigatorTab';
import { Sidebar } from '../Sidebar';
import { multiOpenablePaths } from '../multi-open';
import type { CommandInputDropHandle } from '../drop-handles';
import { clearClipboard, getClipboardSnapshot, setClipboard } from './file-navigator-clipboard';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeFiles(overrides: Partial<FileNavigatorView> = {}): FileNavigatorView {
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

describe('FileNavigatorTab', () => {
  it('renders rows with indentation, chevrons on dirs, aria-expanded/aria-selected', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
    render(<FileNavigatorTab files={files} client={client} index={0} />);
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
    render(<FileNavigatorTab files={files} client={client} index={0} />);
    expect(screen.getByText('staged.txt').className).toContain('files-name--staged');
    expect(screen.getByText('conflict.txt').className).toContain('files-name--conflict');
  });

  it('renders the branch name in .files-branch when present', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles({ branch: 'main' })} client={client} index={0} />);
    const branchEl = container.querySelector('.files-branch');
    expect(branchEl).not.toBeNull();
    expect(branchEl!.textContent).toBe('main');
  });

  it('renders no .files-branch element when branch is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-branch')).toBeNull();
  });

  it('renders a .files-github button when githubUrl is present', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(
      <FileNavigatorTab files={makeFiles({ githubUrl: 'https://github.com/owner/repo/commits/main/' })} client={client} index={0} />,
    );
    expect(container.querySelector('.files-github')).not.toBeNull();
  });

  it('renders no .files-github element when githubUrl is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-github')).toBeNull();
  });

  it('renders a .files-pull button when branch is present and clicking it sends fileNavigatorPull', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles({ branch: 'main' })} client={client} index={0} />);
    const pull = container.querySelector('.files-pull');
    expect(pull).not.toBeNull();
    fireEvent.click(pull!);
    expect(client.send).toHaveBeenCalledWith({ method: 'fileNavigatorPull', params: { index: 0 } });
  });

  it('signals the pull status the tree payload carries on its pull button', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(
      <FileNavigatorTab files={makeFiles({ branch: 'main', pull: 'pulling' })} client={client} index={0} />,
    );
    expect(container.querySelector('.files-pull--pulling')).not.toBeNull();
  });

  it('renders no .files-pull element when branch is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-pull')).toBeNull();
  });

  it('renders a "Looking for" banner and no rows while waitingFor is set', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(
      <FileNavigatorTab files={makeFiles({ rows: [], waitingFor: '/home/user/project/not-yet-there' })} client={client} index={0} />,
    );
    const banner = container.querySelector('.files-waiting');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('/home/user/project/not-yet-there');
    expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(0);
  });

  it('renders no .files-waiting banner when waitingFor is undefined', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-waiting')).toBeNull();
  });

  it('renders no detail values when the view carries no details mode', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const files = makeFiles({
      rows: [{ path: 'README.md', name: 'README.md', depth: 0, dir: false, size: 22 }],
    });
    const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
    expect(container.querySelector('.files-detail')).toBeNull();
  });

  it('renders the value each detail mode asks for', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const row = {
      path: 'README.md', name: 'README.md', depth: 0, dir: false,
      size: 22, modified: new Date(2024, 6, 13, 23, 29).getTime(), mode: 0o10_0644,
    };

    const sized = render(<FileNavigatorTab files={makeFiles({ rows: [row], details: 'size' })} client={client} index={0} />);
    expect(sized.container.querySelector('.files-detail')!.textContent).toBe('22b');
    sized.unmount();

    const modified = render(<FileNavigatorTab files={makeFiles({ rows: [row], details: 'modified' })} client={client} index={0} />);
    expect(modified.container.querySelector('.files-detail')!.textContent).toBe('Jul 13 23:29');
    modified.unmount();

    const permissions = render(<FileNavigatorTab files={makeFiles({ rows: [row], details: 'permissions' })} client={client} index={0} />);
    expect(permissions.container.querySelector('.files-detail')!.textContent).toBe('-rw-r--r--');
  });

  it('leaves directory rows, the .. row, and a row missing its value blank in size mode', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const files = makeFiles({
      details: 'size',
      rows: [
        { path: '..', name: '..', depth: 0, dir: true },
        { path: 'src', name: 'src', depth: 0, dir: true, expanded: false },
        { path: 'README.md', name: 'README.md', depth: 0, dir: false },
      ],
    });
    const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
    expect(container.querySelectorAll('.files-detail')).toHaveLength(0);
  });

  it('detail button names the next mode and sends fileNavigatorSetDetail for it', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles({ details: 'size' })} client={client} index={2} />);

    const button = container.querySelector('.files-detail-cycle') as HTMLElement;
    expect(button.getAttribute('title')).toBe('Show modified');
    fireEvent.click(button);
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorSetDetail', params: { index: 2, details: 'modified' } });
  });

  it('detail button offers size first for a tree with no details mode', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(container.querySelector('.files-detail-cycle')!.getAttribute('title')).toBe('Show size');
  });

  it('click on a directory row selects but does not toggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
    fireEvent.click(screen.getByText('src'));
    expect(send).not.toHaveBeenCalled();
  });

  it('double-click on a directory row sends fileNavigatorToggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
    fireEvent.dblClick(screen.getByText('src'));
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorToggle', params: { index: 2, path: 'src' } });
  });

  it('single click on a file row selects but does not open', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    fireEvent.click(screen.getByText('README.md'));
    expect(send).not.toHaveBeenCalled();
  });

  it('supports range and toggle selection with separate cursor accessibility state', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
    fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, shiftKey: true });

    expect(tree).toHaveAttribute('aria-multiselectable', 'true');
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(3);
    expect(tree.getAttribute('aria-activedescendant')).toBe(
      screen.getByText('README.md').closest('[role="treeitem"]')!.id,
    );

    fireEvent.mouseDown(screen.getByText('index.ts'), { button: 0, metaKey: true });
    const indexRow = screen.getByText('index.ts').closest('[role="treeitem"]')!;
    expect(indexRow).toHaveAttribute('aria-selected', 'false');
    expect(indexRow).toHaveClass('cursor');
  });

  it('modified parent-row presses collapse selection to the parent row', () => {
    const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }, ...makeFiles().rows] });
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
    fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
    fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, metaKey: true });
    fireEvent.mouseDown(screen.getByText('..'), { button: 0, shiftKey: true });
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(screen.getByText('..').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape clears every selected row and the cursor', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
    fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, shiftKey: true });
    expect(container.querySelectorAll('[aria-selected="true"]').length).toBeGreaterThan(1);

    fireEvent.keyDown(tree, { key: 'Escape' });
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('.files-row.cursor')).toHaveLength(0);
    expect(tree.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('Escape with nothing selected and nothing on the clipboard is left to the window bindings', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    const handled = fireEvent.keyDown(tree, { key: 'Escape' });
    expect(handled).toBe(true); // not preventDefault-ed by the tree
  });

  it('Escape disarms a pending copy: the mark clears and a later paste sends nothing', () => {
    const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
    const client = { send: vi.fn(), request } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
    fireEvent.keyDown(tree, { key: 'c', ctrlKey: true });
    expect(screen.getByText('README.md').closest('.files-row')).toHaveClass('copied');

    fireEvent.keyDown(tree, { key: 'Escape' });
    expect(screen.getByText('README.md').closest('.files-row')).not.toHaveClass('copied');
    fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
    fireEvent.keyDown(tree, { key: 'v', ctrlKey: true });
    expect(request).not.toHaveBeenCalled();
  });

  it('Escape disarms a pending cut, clearing its dimming', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
    fireEvent.keyDown(tree, { key: 'x', ctrlKey: true });
    fireEvent.keyDown(tree, { key: 'Escape' }); // clears selection and clipboard together
    expect(screen.getByText('README.md').closest('.files-row')).not.toHaveClass('cut');
  });

  // The armed-clipboard half of the Escape guard on its own: a navigator with nothing selected
  // still takes Escape when another navigator armed the app-wide clipboard.
  it('Escape claims the key for a clipboard armed elsewhere, with no selection of its own', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    setClipboard('copy', ['/elsewhere/notes.md']);
    const handled = fireEvent.keyDown(tree, { key: 'Escape' });
    expect(handled).toBe(false); // prevent-defaulted by the tree
    expect(getClipboardSnapshot()).toBeNull();
  });

  it('double-click on a file row sends an open command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('index.ts'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open /home/user/project/src/index.ts' } });
  });

  it('Shift+double-click on a file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('index.ts'), { shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /home/user/project/src/index.ts' } });
  });

  it('double-click on a markdown file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /home/user/project/README.md' } });
  });

  it('Shift+double-click on a markdown file row sends an open command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'), { shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open /home/user/project/README.md' } });
  });

  it('double-click on a file row uses the unshortened absoluteRoot, not the display-abbreviated root', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const files = makeFiles({ root: '~/project', absoluteRoot: '/Users/derrick/project' });
    render(<FileNavigatorTab files={files} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('index.ts'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open /Users/derrick/project/src/index.ts' } });
  });

  it('shows opener choices for an unsupported file and edits it when chosen', async () => {
    const send = vi.fn();
    const request = vi.fn().mockResolvedValue({ choices: [
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ] });
    const client = { send, request } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: 'data.xyz', name: 'data.xyz', depth: 0, dir: false }] });
    render(<FileNavigatorTab files={files} client={client} index={3} />);
    fireEvent.dblClick(screen.getByText('data.xyz'));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Open data.xyz' })).toBeInTheDocument());
    fireEvent.click(screen.getByText('Edit as text'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /home/user/project/data.xyz' } });
  });

  it('collapse-all button sends fileNavigatorCollapseAll', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={1} />);
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorCollapseAll', params: { index: 1 } });
  });

  it('double-click on ".." row sends fileNavigatorReroot', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }, ...makeFiles().rows] })} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('..'));
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorReroot', params: { index: 0 } });
  });

  it('ArrowDown moves selection and Enter opens the selected file', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' }); // no selection yet -> defaults to src (index 0), moves to src/index.ts
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open /home/user/project/src/index.ts' } });
  });

  it('ArrowRight on a collapsed dir sends fileNavigatorToggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: 'src', name: 'src', depth: 0, dir: true }] });
    const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorToggle', params: { index: 0, path: 'src' } });
  });

  it('Enter on ".." row sends fileNavigatorReroot', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
    const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'fileNavigatorReroot', params: { index: 0 } });
  });

  it('Shift+Enter on a file sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    fireEvent.keyDown(tree, { key: 'Enter', shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit /home/user/project/README.md' } });
  });

  it('type-ahead jumps to a matching row', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const tree = container.querySelector('[role="tree"]')!;
    fireEvent.keyDown(tree, { key: 'r' });
    expect(screen.getByText('README.md').closest('[role="treeitem"]')!.getAttribute('aria-selected')).toBe('true');
  });

  it('resets selected to first row when selected row disappears', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    const files1 = makeFiles();
    rerender(<FileNavigatorTab files={files1} client={client} index={0} />);
    const files2 = makeFiles({ rows: files1.rows.slice(1) });
    rerender(<FileNavigatorTab files={files2} client={client} index={0} />);
  });

  it('dock-cycle button is hidden when the navigator is in a center tab', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(screen.queryByTitle('Move to left sidebar')).toBeNull();
    expect(screen.queryByTitle('Move to right sidebar')).toBeNull();
  });

  it('dock-cycle button from left sends setDock to right', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} dock="left" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 0, dock: 'right' } });
  });

  it('dock-cycle button from right sends setDock to left', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} dock="right" />);
    fireEvent.click(screen.getByTitle('Move to left sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 0, dock: 'left' } });
  });

  it('autoFocus defaults to true (center mount) and can be suppressed for sidebar mounts', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    focusSpy.mockClear();
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} autoFocus={false} />);
    expect(focusSpy).not.toHaveBeenCalled();
    render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
    expect(focusSpy).toHaveBeenCalled();
    focusSpy.mockRestore();
  });

  describe('delete', () => {
    it('Backspace with a row selected opens the delete dialog with that row\'s name', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.getByText('Delete "README.md"?')).toBeInTheDocument();
    });

    it('Delete key opens the delete dialog the same way', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Delete' });
      expect(screen.getByText('Delete "README.md"?')).toBeInTheDocument();
    });

    it('Backspace/Delete with the ".." row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
      const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('Backspace/Delete with no row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'Backspace' });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('confirming the dialog sends deleteFileNavigatorItem with the selected path and closes the dialog', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={3} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      expect(send).toHaveBeenCalledWith({ method: 'deleteFileNavigatorItem', params: { index: 3, relPath: 'README.md' } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('cancelling the dialog sends nothing and closes the dialog', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r' });
      fireEvent.keyDown(tree, { key: 'Backspace' });
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(send).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('confirms one normalized batch as a single send, with no failure dialog', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={3} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, metaKey: true });
      fireEvent.keyDown(tree, { key: 'Delete' });
      expect(screen.getByText('Delete 2 items?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      expect(send).toHaveBeenCalledWith({
        method: 'deleteFileNavigatorItems',
        params: { index: 3, paths: ['src', 'README.md'] },
      });
    });
  });

  describe('copy, cut, and paste', () => {
    afterEach(() => {
      clearClipboard();
    });

    it('Ctrl+C then Ctrl+V on a directory row sends the RPC with the expected params', () => {
      const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={3} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'c', ctrlKey: true });
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'v', ctrlKey: true });
      expect(request).toHaveBeenCalledWith({
        method: 'pasteFileNavigatorItems',
        params: {
          index: 3,
          sources: ['/home/user/project/README.md'],
          destinationPath: 'src',
          mode: 'copy',
          policy: undefined,
        },
      });
    });

    it('Ctrl+X dims the cut rows', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'x', ctrlKey: true });
      expect(screen.getByText('README.md').closest('.files-row')).toHaveClass('cut');
    });

    it('Ctrl+C marks the copied rows without dimming them', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'c', ctrlKey: true });
      const row = screen.getByText('README.md').closest('.files-row');
      expect(row).toHaveClass('copied');
      expect(row).not.toHaveClass('cut');
      expect(screen.getByText('src').closest('.files-row')).not.toHaveClass('copied');
    });

    it('a later Ctrl+X replaces the copy mark with the cut mark', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'c', ctrlKey: true });
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'x', ctrlKey: true });
      expect(screen.getByText('README.md').closest('.files-row')).not.toHaveClass('copied');
      expect(screen.getByText('src').closest('.files-row')).toHaveClass('cut');
    });
  });

  describe('rename', () => {
    const selectReadme = (tree: Element) => {
      fireEvent.keyDown(tree, { key: 'r' }); // type-ahead selects README.md
    };

    it('Cmd+R on a selected file opens an editable field pre-filled with its name', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('README.md');
    });

    it('Ctrl+R works the same as Cmd+R', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', ctrlKey: true });
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('Enter with a changed name sends renameFileNavigatorItem and closes the field', async () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container, rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'renamed.md{Enter}');
      expect(send).toHaveBeenCalledWith({ method: 'renameFileNavigatorItem', params: { index: 2, relPath: 'README.md', newName: 'renamed.md' } });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      const renamedFiles = makeFiles({ rows: makeFiles().rows.map((row) => row.path === 'README.md' ? { ...row, path: 'renamed.md', name: 'renamed.md' } : row) });
      rerender(<FileNavigatorTab files={renamedFiles} client={client} index={2} />);
      expect(screen.getByText('renamed.md').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(tree);
    });

    it('Enter with no change sends nothing', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'ArrowDown' });
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('the chord with no row selected does nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('committing a name colliding with a visible sibling opens MoveConflictDialog', async () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={4} />);
      const tree = container.querySelector('[role="tree"]')!;
      selectReadme(tree);
      fireEvent.keyDown(tree, { key: 'r', metaKey: true });
      const input = screen.getByRole('textbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'src{Enter}');
      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
      expect(send).toHaveBeenCalledWith({ method: 'renameFileNavigatorItem', params: { index: 4, relPath: 'README.md', newName: 'src' } });
    });

    it('Cancel on the rename conflict dialog reopens the edit field', async () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(srcRow.className).toContain('drop-target');
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });
    });

    it('dragging a file over another file row highlights that file\'s parent directory instead', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
      const indexRow = screen.getByText('index.ts').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(indexRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 2, fromRelPath: 'README.md', toRelPath: 'src' } });
    });

    it('dragging a file renders a ghost label with its name that follows the cursor', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(screen.getByText('README.md', { selector: '.files-drag-ghost' })).toBeInTheDocument();

      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(screen.queryByText('README.md', { selector: '.files-drag-ghost' })).toBeNull();
    });

    it('drop on a valid directory sends moveFileNavigatorItem with the right paths', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
      const srcRow = screen.getByText('src').closest('[role="treeitem"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(srcRow);

      fireEvent.mouseDown(screen.getByText('README.md'), { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });

      expect(send).toHaveBeenCalledWith({ method: 'moveFileNavigatorItem', params: { index: 2, fromRelPath: 'README.md', toRelPath: 'src' } });
    });

    it('shows no drop target when a remote row is dragged over a local tree', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<>
        <FileNavigatorTab
          files={makeFiles({ remote: { host: 'devbox', address: 'devbox' } })}
          client={client}
          index={0}
        />
        <FileNavigatorTab files={makeFiles()} client={client} index={1} />
      </>);
      const trees = container.querySelectorAll('.files-tab');
      const dragged = trees[0].querySelector('[data-path="README.md"]') as HTMLElement;
      const destination = trees[1].querySelector('[data-path="src"]') as HTMLElement;
      document.elementFromPoint = vi.fn().mockReturnValue(destination);

      fireEvent.mouseDown(dragged, { clientX: 0, clientY: 0 });
      act(() => { globalThis.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 })); });

      expect(trees[0].querySelector('.drop-target')).toBeNull();
      act(() => { globalThis.dispatchEvent(new MouseEvent('mouseup')); });
      expect(send).not.toHaveBeenCalled();
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
      const { container } = render(<FileNavigatorTab files={files} client={client} index={0} />);
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
      const { container } = render(
        <Sidebar side="left" tabs={[tab]} client={client} dropRef={dropRef} targetCwd="/home/user" />,
      );
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
      expect(dropHandle.insertAtCaret).toHaveBeenCalledWith('project/README.md');
      bar.remove();
    });
  });

  describe('new file', () => {
    it('New file button renders with the tooltip', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('New file')).toBeInTheDocument();
    });

    it('clicking New file with a directory row selected dispatches newfile inside that directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('src'));
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /home/user/project/src/untitled.md' } });
    });

    it('clicking New file with a file row selected dispatches newfile in its containing directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('index.ts'));
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /home/user/project/src/untitled.md' } });
    });

    it('clicking New file with no row selected dispatches newfile at the tree root', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /home/user/project/untitled.md' } });
    });

    it('dispatches under the tree root when the navigator is rooted somewhere else', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({ root: '/Users/ash/dev/bctci', absoluteRoot: '/Users/ash/dev/bctci' });
      render(<FileNavigatorTab files={files} client={client} index={0} />);
      fireEvent.click(screen.getByText('src'));
      fireEvent.click(screen.getByTitle('New file'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /Users/ash/dev/bctci/src/untitled.md' } });
    });

    it('Cmd+N while focused dispatches the same new-file command', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'n', metaKey: true });
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /home/user/project/untitled.md' } });
    });

    it('Ctrl+N while focused dispatches the same new-file command', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'n', ctrlKey: true });
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newfile /home/user/project/untitled.md' } });
    });

    it('Cmd+N does not fall through to the window handler', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      const nativeEvent = fireEvent.keyDown(tree, { key: 'n', metaKey: true });
      expect(nativeEvent).toBe(false); // preventDefault() was called
    });
  });

  describe('new directory', () => {
    it('New directory button renders with the tooltip', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('New directory')).toBeInTheDocument();
    });

    it('creates inside a selected directory', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('src'));
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir /home/user/project/src/untitled' } });
    });

    it("creates in a selected file's containing directory", () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByText('index.ts'));
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir /home/user/project/src/untitled' } });
    });

    it('creates at the tree root when nothing is selected', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir /home/user/project/untitled' } });
    });

    it('dispatches under the tree root when the navigator is rooted somewhere else', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({ root: '/Users/ash/dev/bctci', absoluteRoot: '/Users/ash/dev/bctci' });
      render(<FileNavigatorTab files={files} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'newdir /Users/ash/dev/bctci/untitled' } });
    });

    it('selects and opens the rename field once the created directory appears in files.rows', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withNewDir = makeFiles({
        rows: [...makeFiles().rows, { path: 'untitled', name: 'untitled', depth: 0, dir: true }],
      });
      rerender(<FileNavigatorTab files={withNewDir} client={client} index={0} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('untitled');
    });

    it('does nothing when an unrelated row appears instead', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withOtherFile = makeFiles({
        rows: [...makeFiles().rows, { path: 'other.txt', name: 'other.txt', depth: 0, dir: false }],
      });
      rerender(<FileNavigatorTab files={withOtherFile} client={client} index={0} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('does nothing when the actual created name differs from the guess (collision)', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('New directory'));
      const withRenamedDir = makeFiles({
        rows: [...makeFiles().rows, { path: 'untitled-2', name: 'untitled-2', depth: 0, dir: true }],
      });
      rerender(<FileNavigatorTab files={withRenamedDir} client={client} index={0} />);
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  describe('undo/redo', () => {
    it('Cmd+Z sends undoFileNavigatorItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={2} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'undoFileNavigatorItem', params: { index: 2 } });
    });

    it('Ctrl+Z sends undoFileNavigatorItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', ctrlKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'undoFileNavigatorItem', params: { index: 0 } });
    });

    it('Cmd+Shift+Z sends redoFileNavigatorItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={1} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true, shiftKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'redoFileNavigatorItem', params: { index: 1 } });
    });

    it('Ctrl+Shift+Z sends redoFileNavigatorItem', async () => {
      const request = vi.fn().mockResolvedValue({});
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', ctrlKey: true, shiftKey: true }); });
      expect(request).toHaveBeenCalledWith({ method: 'redoFileNavigatorItem', params: { index: 0 } });
    });

    it('a conflict response from undo opens MoveConflictDialog', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('confirming an undo conflict retries undoFileNavigatorItem with overwrite', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={4} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true }); });

      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));

      expect(send).toHaveBeenCalledWith({ method: 'undoFileNavigatorItem', params: { index: 4, overwrite: true } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('confirming a redo conflict retries redoFileNavigatorItem with overwrite', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'README.md', toRelPath: 'dest' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={5} />);
      const tree = container.querySelector('[role="tree"]')!;
      await act(async () => { fireEvent.keyDown(tree, { key: 'z', metaKey: true, shiftKey: true }); });

      fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));

      expect(send).toHaveBeenCalledWith({ method: 'redoFileNavigatorItem', params: { index: 5, overwrite: true } });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('cancelling a conflict leaves it unmoved and closes the dialog without sending anything', async () => {
      const request = vi.fn().mockResolvedValue({ conflict: { fromRelPath: 'dest/README.md', toRelPath: '' } });
      const send = vi.fn();
      const client = { send, request } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByTitle('Search files')).toBeInTheDocument();
    });

    it('clicking Search files opens the pop-up showing Searching… before the list resolves, then matches after', async () => {
      const { promise, resolve } = withResolvers<{ paths: string[] }>();
      const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      expect(screen.getByText('Searching…')).toBeInTheDocument();
      await act(async () => { resolve({ paths: ['src/index.ts', 'README.md'] }); await promise; });
      fireEvent.change(screen.getByPlaceholderText('Find file…'), { target: { value: 'index' } });
      expect(screen.getByText('> src/index.ts')).toBeInTheDocument();
    });

    it('shows (no matching files) for a non-matching query and Enter is a no-op', async () => {
      const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: ['README.md'] })) } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
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
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      expect(container.querySelector('[role="tree"]')).toHaveFocus();
    });

    it('Tab accepts the ghost completion into the input without closing the pop-up', async () => {
      const client = { send: vi.fn(), request: vi.fn(() => Promise.resolve({ paths: ['src/index.ts'] })) } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      const input = screen.getByPlaceholderText('Find file…');
      fireEvent.change(input, { target: { value: 'index' } });
      fireEvent.keyDown(input, { key: 'Tab' });
      expect(screen.getByPlaceholderText('Find file…')).toHaveValue('index.ts');
      expect(screen.getByPlaceholderText('Find file…')).toBeInTheDocument();
    });

    it('selecting a match sends revealFileNavigatorItem and selects the row once it appears', async () => {
      const send = vi.fn();
      const client = { send, request: vi.fn(() => Promise.resolve({ paths: ['src/index.ts'] })) } as unknown as JanusClient;
      const { rerender } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      await act(async () => { await Promise.resolve(); });
      fireEvent.change(screen.getByPlaceholderText('Find file…'), { target: { value: 'index' } });
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Enter' });
      expect(send).toHaveBeenCalledWith({ method: 'revealFileNavigatorItem', params: { index: 0, relPath: 'src/index.ts' } });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      rerender(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      expect(screen.getByText('index.ts').closest('[role="treeitem"]')).toHaveAttribute('aria-selected', 'true');
    });

    it('a reply that arrives after the pop-up is closed does not reopen or repopulate it', async () => {
      const { promise, resolve } = withResolvers<{ paths: string[] }>();
      const client = { send: vi.fn(), request: vi.fn(() => promise) } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.click(screen.getByTitle('Search files'));
      fireEvent.keyDown(screen.getByPlaceholderText('Find file…'), { key: 'Escape' });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
      await act(async () => { resolve({ paths: ['README.md'] }); await promise; });
      expect(screen.queryByPlaceholderText('Find file…')).not.toBeInTheDocument();
    });
  });

  describe('multi-row keyboard selection', () => {
    it('Shift+ArrowDown extends the selection and Shift+ArrowUp shrinks it back', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'ArrowDown', shiftKey: true });
      expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
      fireEvent.keyDown(tree, { key: 'ArrowDown', shiftKey: true });
      expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(3);
      fireEvent.keyDown(tree, { key: 'ArrowUp', shiftKey: true });
      expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2);
    });

    it('Shift+ArrowUp at the top row changes nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'ArrowUp', shiftKey: true });
      expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
      expect(screen.getByText('src').closest('[role="treeitem"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('Cmd+A selects the cursor row\'s siblings without the expanded subtree', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0 });
      fireEvent.keyDown(tree, { key: 'a', metaKey: true });
      const selected = [...container.querySelectorAll('[aria-selected="true"]')].map((row) => row.textContent);
      expect(selected).toEqual(['src', 'README.md']);
    });

    it('Cmd+A with no cursor selects nothing', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      const tree = container.querySelector('[role="tree"]')!;
      fireEvent.keyDown(tree, { key: 'a', metaKey: true });
      expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    });
  });

  describe('row context menu', () => {
    afterEach(() => {
      clearClipboard();
    });

    it('opens for the right-clicked row and leaves the selection untouched', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.contextMenu(screen.getByText('README.md'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      const selected = [...container.querySelectorAll('[aria-selected="true"]')].map((row) => row.textContent);
      expect(selected).toEqual(['src']);
    });

    it('omits Paste until something is on the clipboard', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('README.md'));
      expect(screen.queryByText('Paste')).not.toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      act(() => { setClipboard('copy', ['/home/user/project/README.md']); });
      fireEvent.contextMenu(screen.getByText('src'));
      expect(screen.getByText('Paste')).toBeInTheDocument();
    });

    it('omits Open, Edit, Open with, and Rename on the ".." row', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: '..', name: '..', depth: 0, dir: true }] });
      render(<FileNavigatorTab files={files} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('..'));
      expect(screen.queryByText('Open')).not.toBeInTheDocument();
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
      expect(screen.queryByText('Open with')).not.toBeInTheDocument();
      expect(screen.queryByText('Rename')).not.toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    it('omits Edit on a directory row', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: 'src', name: 'src', depth: 0, dir: true }] });
      render(<FileNavigatorTab files={files} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('src'));
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });

    it.each(['notes.txt', 'photo.png'])('choosing Edit for %s sends its absolute edit command', (name) => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({ rows: [{ path: name, name, depth: 0, dir: false }] });
      render(<FileNavigatorTab files={files} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText(name));
      fireEvent.click(screen.getByText('Edit'));
      expect(send).toHaveBeenCalledWith({
        method: 'command', params: { text: `edit /home/user/project/${name}` },
      });
    });

    it('opens every selected image from a selected image row', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({ rows: [
        { path: 'first.png', name: 'first.png', depth: 0, dir: false },
        { path: 'second.jpg', name: 'second.jpg', depth: 0, dir: false },
      ] });
      render(<FileNavigatorTab files={files} client={client} index={0} multiOpen={multiOpenablePaths} />);
      fireEvent.mouseDown(screen.getByText('first.png'), { button: 0 });
      fireEvent.mouseDown(screen.getByText('second.jpg'), { button: 0, metaKey: true });
      fireEvent.contextMenu(screen.getByText('second.jpg'));
      fireEvent.click(screen.getByText('Open'));
      expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'open /home/user/project/first.png' } });
      expect(send).toHaveBeenNthCalledWith(2, { method: 'command', params: { text: 'open /home/user/project/second.jpg' } });
    });

    it('edits every selected image from a selected image row', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      const files = makeFiles({ rows: [
        { path: 'first.png', name: 'first.png', depth: 0, dir: false },
        { path: 'second.jpg', name: 'second.jpg', depth: 0, dir: false },
      ] });
      render(<FileNavigatorTab files={files} client={client} index={0} multiOpen={multiOpenablePaths} />);
      fireEvent.mouseDown(screen.getByText('first.png'), { button: 0 });
      fireEvent.mouseDown(screen.getByText('second.jpg'), { button: 0, metaKey: true });
      fireEvent.contextMenu(screen.getByText('second.jpg'));
      fireEvent.click(screen.getByText('Edit'));
      expect(send).toHaveBeenNthCalledWith(1, { method: 'command', params: { text: 'edit /home/user/project/first.png' } });
      expect(send).toHaveBeenNthCalledWith(2, { method: 'command', params: { text: 'edit /home/user/project/second.jpg' } });
    });

    it('choosing Delete opens the ordinary delete confirmation', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('README.md'));
      fireEvent.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete "README.md"?')).toBeInTheDocument();
    });

    it('choosing Delete on a row inside a multi-selection deletes the whole selection', () => {
      const send = vi.fn();
      const client = { send } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={3} />);
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, metaKey: true });
      fireEvent.contextMenu(screen.getByText('README.md'));
      fireEvent.click(screen.getByText('Delete'));
      expect(screen.getByText('Delete 2 items?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /delete/i }));
      expect(send).toHaveBeenCalledWith({
        method: 'deleteFileNavigatorItems',
        params: { index: 3, paths: ['src', 'README.md'] },
      });
    });

    it('choosing Copy arms the clipboard with the clicked row', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('README.md'));
      fireEvent.click(screen.getByText('Copy'));
      expect(getClipboardSnapshot()).toEqual({ mode: 'copy', paths: ['/home/user/project/README.md'] });
    });

    it('choosing Duplicate copies the clicked row into its own directory', () => {
      const request = vi.fn().mockResolvedValue({ total: 1, failedPaths: [] });
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={3} />);
      fireEvent.contextMenu(screen.getByText('index.ts'));
      fireEvent.click(screen.getByText('Duplicate'));
      expect(request).toHaveBeenCalledWith({
        method: 'pasteFileNavigatorItems',
        params: {
          index: 3,
          sources: ['/home/user/project/src/index.ts'],
          destinationPath: 'src',
          mode: 'copy',
          policy: undefined,
        },
      });
      expect(getClipboardSnapshot()).toBeNull();
    });

    it('choosing Open with shows the chooser for a file a registered opener claims', async () => {
      const request = vi.fn().mockResolvedValue({
        choices: [
          { label: 'Open as markdown', command: 'open' },
          { label: 'Edit as text', command: 'edit' },
          { label: 'Open externally', command: 'open external' },
        ],
      });
      const client = { send: vi.fn(), request } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('README.md'));
      await act(async () => { fireEvent.click(screen.getByText('Open with')); });
      expect(request).toHaveBeenCalledWith({
        method: 'fileNavigatorOpeners',
        params: { index: 0, relPath: 'README.md', edit: false, all: true },
      });
      expect(screen.getByText('Open README.md with')).toBeInTheDocument();
      expect(screen.getByText('Open as markdown')).toBeInTheDocument();
    });

    it('edits every selected file when choosing Edit as text', async () => {
      const send = vi.fn();
      const request = vi.fn().mockResolvedValue({
        choices: [
          { label: 'Open as markdown', command: 'open' },
          { label: 'Edit as text', command: 'edit' },
          { label: 'Open externally', command: 'open external' },
        ],
      });
      const client = { send, request } as unknown as JanusClient;
      render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.mouseDown(screen.getByText('src'), { button: 0 });
      fireEvent.mouseDown(screen.getByText('README.md'), { button: 0, metaKey: true });
      fireEvent.contextMenu(screen.getByText('README.md'));
      await act(async () => { fireEvent.click(screen.getByText('Open with')); });
      fireEvent.click(screen.getByText('Edit as text'));
      expect(send).toHaveBeenNthCalledWith(1, {
        method: 'command', params: { text: 'edit /home/user/project/src' },
      });
      expect(send).toHaveBeenNthCalledWith(2, {
        method: 'command', params: { text: 'edit /home/user/project/README.md' },
      });
    });

    it('returns keyboard focus to the tree when it closes', () => {
      const client = { send: vi.fn() } as unknown as JanusClient;
      const { container } = render(<FileNavigatorTab files={makeFiles()} client={client} index={0} />);
      fireEvent.contextMenu(screen.getByText('README.md'));
      expect(document.activeElement).toBe(screen.getByRole('menu'));
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(container.querySelector('[role="tree"]'));
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
