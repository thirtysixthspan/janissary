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

  it('renders the launch-agent button only when onLaunchAgentHere is provided', () => {
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onLaunchAgentHere={() => {}} />);
    expect(getByTitle('New agent here')).toBeInTheDocument();
  });

  it('does not render the launch-agent button when onLaunchAgentHere is omitted', () => {
    const { queryByTitle } = render(<AgentTabMeta cwd="~/project" />);
    expect(queryByTitle('New agent here')).not.toBeInTheDocument();
  });

  it('invokes the callback when the launch-agent button is clicked', () => {
    const onLaunch = vi.fn();
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onLaunchAgentHere={onLaunch} />);
    getByTitle('New agent here').click();
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('renders the transcript button only when onOpenTranscript is provided', () => {
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onOpenTranscript={() => {}} />);
    expect(getByTitle('Open transcript')).toBeInTheDocument();
  });

  it('does not render the transcript button when onOpenTranscript is omitted', () => {
    const { queryByTitle } = render(<AgentTabMeta cwd="~/project" />);
    expect(queryByTitle('Open transcript')).not.toBeInTheDocument();
  });

  it('invokes the callback when the transcript button is clicked', () => {
    const onOpen = vi.fn();
    const { getByTitle } = render(<AgentTabMeta cwd="~/project" onOpenTranscript={onOpen} />);
    getByTitle('Open transcript').click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders no model/effort chips when those props are omitted', () => {
    const { container } = render(<AgentTabMeta cwd="~/project" flags={['workspaced']} />);
    expect(container.querySelectorAll('.tab-meta-chip').length).toBe(0);
  });

  it('renders the workspaced flag as a box icon with its accessible label', () => {
    const { getByRole } = render(<AgentTabMeta cwd="~/project" flags={['workspaced']} />);
    const flag = getByRole('img', { name: 'Workspaced' });
    expect(flag).toHaveAttribute('title', 'Workspaced');
    expect(flag.querySelector('svg[data-icon="box"]')).not.toBeNull();
  });

  it('renders the auto-permit flag as a bolt icon with its accessible label', () => {
    const { getByRole } = render(<AgentTabMeta cwd="~/project" flags={['autoApprove']} />);
    const flag = getByRole('img', { name: 'Auto-permitting' });
    expect(flag).toHaveAttribute('title', 'Auto-permitting');
    expect(flag.querySelector('svg[data-icon="bolt"]')).not.toBeNull();
  });
});
