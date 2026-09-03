import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileNavigatorHeader } from './FileNavigatorHeader';

const callbacks = {
  onOpenGithub: vi.fn(), onSetDetail: vi.fn(), onCollapseAll: vi.fn(),
  onSearch: vi.fn(), onNewFile: vi.fn(), onNewDirectory: vi.fn(),
};

describe('FileNavigatorHeader', () => {
  it('renders the remote host ahead of the root with the full address tooltip', () => {
    const { container } = render(
      <FileNavigatorHeader
        root="/remote/ws"
        remote={{ host: 'devbox', address: 'alice@devbox:/srv/project' }}
        {...callbacks}
      />,
    );
    expect(screen.getByTitle('Remote: alice@devbox:/srv/project')).toHaveTextContent('devbox');
    const children = container.querySelector('.files-meta')?.children;
    expect(children?.[0]).toHaveClass('tab-remote-chip');
    expect(children?.[1]).toHaveTextContent('/remote/ws');
  });

  it('renders no remote chip for a local tree', () => {
    render(<FileNavigatorHeader root="/local/ws" {...callbacks} />);
    expect(screen.queryByLabelText('Remote')).toBeNull();
  });

  it('keeps the centre-strip header on one line', () => {
    const { container } = render(<FileNavigatorHeader root="/local/ws" {...callbacks} />);
    expect(container.querySelector('.files-header')).not.toHaveClass('files-header--docked');
  });

  it('stacks the header onto two lines while docked', () => {
    const { container } = render(
      <FileNavigatorHeader root="/local/ws" dock="left" branch="master" {...callbacks} />,
    );
    const header = container.querySelector('.files-header');

    expect(header).toHaveClass('files-header--docked');
    expect(header?.children).toHaveLength(2);
    expect(header?.children[0]).toHaveClass('files-meta');
    expect(header?.children[1]).toHaveClass('files-actions');
  });

  it('offers the docked header the same actions apart from the split control', () => {
    const { container } = render(
      <FileNavigatorHeader root="/local/ws" dock="left" onSplit={vi.fn()} onPull={vi.fn()} {...callbacks} />,
    );
    const actions = container.querySelector('.files-actions');

    expect(actions?.querySelector('.tab-split')).toBeNull();
    for (const action of ['.files-pull', '.files-search', '.files-new-file', '.files-new-directory', '.files-dock-cycle', '.files-detail-cycle', '.files-collapse-all']) {
      expect(actions?.querySelector(action), action).not.toBeNull();
    }
  });

  it('renders the pull button when onPull is provided and places it after the GitHub button', () => {
    const { container } = render(<FileNavigatorHeader root="/local/ws" onPull={vi.fn()} githubUrl="https://github.com/owner/repo/commits/main/" {...callbacks} />);
    const actions = [...(container.querySelector('.files-actions')!.children)];
    const pull = actions.find((child) => child.className === 'files-pull');
    expect(pull).toBeDefined();
    expect(actions.indexOf(pull!)).toBeGreaterThan(actions.findIndex((child) => child.className === 'files-github'));
  });

  it('renders no pull button without onPull', () => {
    const { container } = render(<FileNavigatorHeader root="/local/ws" {...callbacks} />);
    expect(container.querySelector('.files-pull')).toBeNull();
  });
});
