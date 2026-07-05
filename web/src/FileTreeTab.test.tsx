import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { FileTreeView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { FileTreeTab } from './FileTreeTab';

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

  it('click on a directory row sends fileTreeToggle', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={2} />);
    fireEvent.click(screen.getByText('src'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeToggle', params: { index: 2, path: 'src' } });
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

  it('Alt+double-click on a file row sends an edit command', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={0} />);
    fireEvent.dblClick(screen.getByText('README.md'), { altKey: true });
    expect(send).toHaveBeenCalledWith({ method: 'command', params: { text: 'edit README.md' } });
  });

  it('collapse-all button sends fileTreeCollapseAll', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    render(<FileTreeTab files={makeFiles()} client={client} index={1} />);
    fireEvent.click(screen.getByTitle('Collapse all'));
    expect(send).toHaveBeenCalledWith({ method: 'fileTreeCollapseAll', params: { index: 1 } });
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
});
