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
});
