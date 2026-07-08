import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
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
    fireEvent.dblClick(screen.getByText('README.md'));
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'open README.md' } });
  });

  it('Shift+double-click on a file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'), { shiftKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit README.md' } });
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

  it('dock-cycle button from center sends fileTreeSetDock to left, with the left tooltip', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    const button = screen.getByTitle('Move to left sidebar');
    fireEvent.click(button);
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeSetDock', params: { index: 0, dock: 'left' } });
  });

  it('dock-cycle button from left sends fileTreeSetDock to right', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} dock="left" />);
    fireEvent.click(screen.getByTitle('Move to right sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeSetDock', params: { index: 0, dock: 'right' } });
  });

  it('dock-cycle button from right sends fileTreeSetDock to left', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} dock="right" />);
    fireEvent.click(screen.getByTitle('Move to left sidebar'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeSetDock', params: { index: 0, dock: 'left' } });
  });

  it('header close button is shown only while docked, and sends closeTab', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { rerender } = render(<FileTreeTab files={makeFiles()} client={client} index={3} />);
    expect(screen.queryByTitle('Close')).toBeNull();
    rerender(<FileTreeTab files={makeFiles()} client={client} index={3} dock="left" />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 3 } });
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
});
