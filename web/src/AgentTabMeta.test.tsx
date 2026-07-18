import React from 'react';
import { render, fireEvent } from '@testing-library/react';
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

  it('renders an active connections button with hover and click handlers wired', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const onClick = vi.fn();
    const { getByTitle } = render(
      <AgentTabMeta cwd="~/project" connectionsButton={{ hasContent: true, onEnter, onLeave, onClick }} />,
    );
    const button = getByTitle('connections');
    expect(button).not.toBeDisabled();
    fireEvent.mouseEnter(button);
    expect(onEnter).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(button);
    expect(onLeave).toHaveBeenCalledTimes(1);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders an empty connections button as dark and inert with its tooltip', () => {
    const onEnter = vi.fn();
    const onClick = vi.fn();
    const { getByTitle } = render(
      <AgentTabMeta cwd="~/project" connectionsButton={{ hasContent: false, onEnter, onLeave: () => {}, onClick }} />,
    );
    const button = getByTitle('no active connections');
    expect(button).toBeDisabled();
    fireEvent.mouseEnter(button);
    expect(onEnter).not.toHaveBeenCalled();
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not render the connections button when its props are omitted', () => {
    const { queryByTitle } = render(<AgentTabMeta cwd="~/project" />);
    expect(queryByTitle('connections')).not.toBeInTheDocument();
    expect(queryByTitle('no active connections')).not.toBeInTheDocument();
  });

  it('renders an active schedule button with its tooltip', () => {
    const { getByTitle } = render(
      <AgentTabMeta cwd="~/project" scheduleButton={{ hasContent: true, onEnter: () => {}, onLeave: () => {}, onClick: () => {} }} />,
    );
    expect(getByTitle('schedule')).not.toBeDisabled();
  });

  it('renders an empty schedule button as dark and inert with its tooltip', () => {
    const { getByTitle } = render(
      <AgentTabMeta cwd="~/project" scheduleButton={{ hasContent: false, onEnter: () => {}, onLeave: () => {}, onClick: () => {} }} />,
    );
    expect(getByTitle('no active schedules')).toBeDisabled();
  });
});
