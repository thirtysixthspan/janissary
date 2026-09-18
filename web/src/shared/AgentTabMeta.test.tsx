import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgentTabMeta } from './AgentTabMeta';

describe('AgentTabMeta', () => {
  it('renders the display form of the cwd when cwdDisplay is given', () => {
    const { container } = render(
      <AgentTabMeta cwd="$root/workspace/bekir" cwdDisplay="$workspace" />,
    );
    expect(container.querySelector('.tab-cwd')).toHaveTextContent('$workspace');
  });

  it('falls back to the plain cwd when cwdDisplay is absent', () => {
    const { container } = render(<AgentTabMeta cwd="~/project" />);
    expect(container.querySelector('.tab-cwd')).toHaveTextContent('~/project');
  });

  it('renders the exact Split control only when enabled', () => {
    const onSplit = vi.fn();
    const { rerender } = render(<AgentTabMeta cwd="~/project" onSplit={onSplit} />);
    const button = screen.getByRole('button', { name: 'Split' });
    expect(button).toHaveAttribute('title', 'Split');
    fireEvent.click(button);
    expect(onSplit).toHaveBeenCalled();
    rerender(<AgentTabMeta cwd="~/project" />);
    expect(screen.queryByRole('button', { name: 'Split' })).toBeNull();
  });

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

  it('names the workspace in both action tooltips for a workspaced tab', () => {
    const { getByTitle } = render(
      <AgentTabMeta
        cwd="~/project"
        flags={['workspaced']}
        onOpenFileNavigator={() => {}}
        onLaunchAgentHere={() => {}}
      />,
    );
    expect(getByTitle('Open file navigator in this workspace')).toBeInTheDocument();
    expect(getByTitle('New agent in this workspace')).toBeInTheDocument();
  });

  it('keeps both here tooltips for a plain tab', () => {
    const { getByTitle } = render(
      <AgentTabMeta cwd="~/project" onOpenFileNavigator={() => {}} onLaunchAgentHere={() => {}} />,
    );
    expect(getByTitle('Open file navigator here')).toBeInTheDocument();
    expect(getByTitle('New agent here')).toBeInTheDocument();
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

  it('groups every optional metadata button in the right-side actions', () => {
    const status = { hasContent: true, onEnter: () => {}, onLeave: () => {}, onClick: () => {} };
    const { container } = render(
      <AgentTabMeta
        cwd="~/project"
        onOpenFileNavigator={() => {}}
        onLaunchAgentHere={() => {}}
        onOpenTranscript={() => {}}
        connectionsButton={status}
        scheduleButton={status}
        onSplit={() => {}}
      />,
    );
    const actions = container.querySelector('.tab-meta-actions')!;

    expect(actions.querySelectorAll('button')).toHaveLength(6);
    expect(container.querySelector('.tab-meta')?.querySelectorAll(':scope > button')).toHaveLength(0);
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

  it('renders the browser flag as a globe icon with its accessible label', () => {
    const { getByRole } = render(<AgentTabMeta cwd="~/project" flags={['browser']} />);
    const flag = getByRole('img', { name: 'E2E browser' });
    expect(flag).toHaveAttribute('title', 'E2E browser');
    expect(flag.querySelector('svg[data-icon="globe"]')).not.toBeNull();
  });

  it('renders all three flag icons together in the order the server sent them', () => {
    const { container } = render(
      <AgentTabMeta cwd="~/project" flags={['workspaced', 'autoApprove', 'browser']} />,
    );
    const icons = [...container.querySelectorAll<SVGElement>(':scope .tab-flag svg')].map((svg) => svg.dataset.icon);
    expect(icons).toEqual(['box', 'bolt', 'globe']);
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

  describe('remote host chip', () => {
    const remote = { address: 'admin@devbox:/srv/proj', host: 'devbox' };

    it('shows the bare host, with the full destination as its tooltip', () => {
      const { getByLabelText } = render(<AgentTabMeta cwd="/srv/proj" remote={remote} />);
      const chip = getByLabelText('Remote');
      expect(chip).toHaveTextContent('devbox');
      expect(chip).toHaveAttribute('title', 'Remote: admin@devbox:/srv/proj');
    });

    it('reuses the metadata chip styling', () => {
      const { getByLabelText } = render(<AgentTabMeta cwd="/srv/proj" remote={remote} />);
      expect(getByLabelText('Remote')).toHaveClass('tab-meta-chip');
    });

    // The row reads "where, then what path there".
    it('places the chip before the working directory', () => {
      const { container, getByLabelText } = render(<AgentTabMeta cwd="/srv/proj" remote={remote} />);
      const cwd = container.querySelector('.tab-cwd')!;
      const position = getByLabelText('Remote').compareDocumentPosition(cwd);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders the row exactly as before for a tab with no remote', () => {
      const { queryByLabelText, container } = render(<AgentTabMeta cwd="~/project" />);
      expect(queryByLabelText('Remote')).toBeNull();
      expect(container.querySelector('.tab-cwd')).toHaveTextContent('~/project');
    });

    it('sits alongside the model and effort chips', () => {
      const { getByLabelText } = render(
        <AgentTabMeta cwd="/srv/proj" remote={remote} model="opus" effort="high" />,
      );
      expect(getByLabelText('Remote')).toHaveTextContent('devbox');
      expect(getByLabelText('Model')).toHaveTextContent('opus');
      expect(getByLabelText('Effort')).toHaveTextContent('high');
    });
  });

  // One placement covers every remote tab, because this is the one metadata row agent, shell, and
  // harness tabs all render.
  describe('the remote session control', () => {
    const remote = { address: 'devbox:/srv/proj', host: 'devbox' };

    // The action answers whether it ran, and the control spins until it does. The default answer is
    // a promise that never settles, so every case below that does not care about the outcome sees
    // the action genuinely in flight rather than already finished.
    const pending = () => new Promise<boolean>(() => {});

    function control(
      state: 'provisioning' | 'active' | 'reconnecting' = 'active',
      answer: () => Promise<boolean> = pending,
    ) {
      const onAction = vi.fn(answer);
      const view = render(
        <AgentTabMeta cwd="/srv/proj" remote={remote} remoteSession={{ state, onAction }} />,
      );
      return { onAction, ...view };
    }

    it('renders only for a remote tab', () => {
      const onAction = vi.fn();
      render(<AgentTabMeta cwd="~/project" remoteSession={{ state: 'active', onAction }} />);
      expect(screen.queryByLabelText('Detach session on devbox')).toBeNull();
    });

    it('renders nothing for a remote tab that was given no control', () => {
      render(<AgentTabMeta cwd="/srv/proj" remote={remote} />);
      expect(screen.queryByLabelText('Detach session on devbox')).toBeNull();
    });

    it('sits beside the host chip', () => {
      const { getByLabelText } = control();
      const chip = getByLabelText('Remote');
      const button = getByLabelText('Detach session on devbox');
      expect(chip.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // There is nothing to come back to until the workspace clone has landed.
    it('is disabled while the tab is provisioning', () => {
      const { getByLabelText } = control('provisioning');
      expect(getByLabelText('Detach session on devbox')).toBeDisabled();
    });

    it('asks before detaching, naming what will go', () => {
      const { onAction, getByLabelText } = control();
      fireEvent.click(getByLabelText('Detach session on devbox'));

      expect(screen.getByRole('alertdialog')).toHaveTextContent('Its tabs will close');
      expect(onAction).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText('Detach', { selector: '.modal-button' }));
      expect(onAction).toHaveBeenCalledWith('detach');
    });

    it('raises nothing when the confirmation is cancelled', () => {
      const { onAction, getByLabelText } = control();
      fireEvent.click(getByLabelText('Detach session on devbox'));
      fireEvent.click(screen.getByText('Cancel', { selector: '.modal-button' }));

      expect(onAction).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    // A detach has to reach the far side, which is not instant.
    it('spins and refuses a second press once an action is in flight', () => {
      const { onAction, getByLabelText } = control();
      fireEvent.click(getByLabelText('Detach session on devbox'));
      fireEvent.click(screen.getByText('Detach', { selector: '.modal-button' }));

      const button = getByLabelText('Detach session on devbox');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    // On a live tab whose transport is gone, reattach means "try now" — it collapses the backoff
    // rather than opening a connection of its own, so it needs no confirmation.
    it('offers reattach without a dialog while the transport is reconnecting', () => {
      const { onAction, getByLabelText } = control('reconnecting');
      fireEvent.click(getByLabelText('Reattach session on devbox'));

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onAction).toHaveBeenCalledWith('reattach');
    });

    // A detach the server refuses — one whose session could not be recorded, say — leaves the tab
    // open, so nothing unmounts to clear the spinner. Without an answer to settle on, the control
    // stayed disabled for the life of the tab with no message anywhere explaining it.
    it('returns to its pressable state when an action is refused', async () => {
      const { getByLabelText } = control('active', () => Promise.resolve(false));
      fireEvent.click(getByLabelText('Detach session on devbox'));
      fireEvent.click(screen.getByText('Detach', { selector: '.modal-button' }));

      await waitFor(() => { expect(getByLabelText('Detach session on devbox')).toBeEnabled(); });
    });

    // Reattach never takes its tab with it, so it has to un-spin on its own answer.
    it('clears the spinner on a reattach without the tab unmounting', async () => {
      const { getByLabelText } = control('reconnecting', () => Promise.resolve(true));
      fireEvent.click(getByLabelText('Reattach session on devbox'));

      await waitFor(() => { expect(getByLabelText('Reattach session on devbox')).toBeEnabled(); });
    });
  });
});
