import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentTabMeta } from './AgentTabMeta';

describe('AgentTabMeta', () => {
  it('renders the file-navigator button only when onOpenFileNavigator is provided', () => {
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onOpenFileNavigator={() => {}} />);
    expect(getByTitle('Open file navigator here')).toBeInTheDocument();
  });

  it('does not render the file-navigator button when onOpenFileNavigator is omitted', () => {
    const { queryByTitle } = render(<AgentTabMeta cwd="~/project" />);
    expect(queryByTitle('Open file navigator here')).not.toBeInTheDocument();
  });

  it('invokes the callback when the file-navigator button is clicked', () => {
    const onOpen = vi.fn();
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onOpenFileNavigator={onOpen} />);
    getByTitle('Open file navigator here').click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders no model/effort chips when those props are omitted', () => {
    const { container } = render(<AgentTabMeta cwd="~/project" flags={['workspaced']} />);
    expect(container.querySelectorAll('.tab-meta-chip').length).toBe(0);
  });
});
