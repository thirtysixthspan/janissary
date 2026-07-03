import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import { TabStrip } from './TabStrip';

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'tab1',
    number: 1,
    dotColor: '#fff',
    group: 0,
    groupColor: '#000',
    busy: false,
    hasUnread: false,
    cwd: '/tmp',
    connections: [],
    schedule: [],
    bufferLines: [],
    cmdHistory: [],
    toolStepsExpanded: false,
    ...overrides,
  };
}

describe('TabStrip', () => {
  it('renders a tab label', () => {
    const tab = makeTab({ label: 'mytab' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('mytab')).toBeInTheDocument();
  });

  it('renders title instead of label when title is set', () => {
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('Display Name')).toBeInTheDocument();
  });

  it('marks the active tab with the active class', () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={1} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    const tabEls = container.querySelectorAll('.tab');
    expect(tabEls[0]).not.toHaveClass('active');
    expect(tabEls[1]).toHaveClass('active');
  });

  it('calls onSelect with the tab index when clicked', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows a close button for harness tabs and renders the harness name', () => {
    const tab = makeTab({ label: 'claude', view: 'harness', title: 'claude' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('shows a close button for page tabs and renders the title', () => {
    const tab = makeTab({ label: 'page-1', view: 'page', title: '1) slashdot.org' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    expect(screen.getByText('1) slashdot.org')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('calls onClose and stops propagation when the close button is clicked', async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const tab = makeTab({ label: 'img', view: 'image' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={onSelect} onClose={onClose} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledWith(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies busy class to the dot when tab is busy', () => {
    const tab = makeTab({ busy: true });
    const { container } = render(
      <TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    expect(container.querySelector('.dot.busy')).toBeInTheDocument();
  });

  it('shows the unread badge when hasUnread is set', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ hasUnread: true })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    expect(container.querySelector('.tab-badge')).toBeInTheDocument();
  });

  it('shows no badge when hasUnread is false', () => {
    const { container } = render(
      <TabStrip tabs={[makeTab({ hasUnread: false })]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />,
    );
    expect(container.querySelector('.tab-badge')).not.toBeInTheDocument();
  });

  it('clicking the active tab label shows an input pre-filled with the current display name', async () => {
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('Display Name'));
    expect(screen.getByDisplayValue('Display Name')).toBeInTheDocument();
  });

  it('clicking an inactive tab label still selects it instead of editing', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} onRename={vi.fn()} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('commits the trimmed value once on Enter', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, '  reviewer  {Enter}');
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(0, '  reviewer  ');
  });

  it('truncates typed input to tabNameMaxLength', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={4} />);
    await userEvent.click(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'abcdefgh{Enter}');
    expect(onRename).toHaveBeenCalledWith(0, 'abcd');
  });

  it('cancels without committing on Escape', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />);
    await userEvent.click(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'x{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Display Name')).toBeInTheDocument();
  });

  it('commits on blur', async () => {
    const onRename = vi.fn();
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(
      <>
        <TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} onRename={onRename} tabNameMaxLength={100} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByText('Display Name'));
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'reviewer');
    await userEvent.click(screen.getByText('elsewhere'));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(0, 'Display Namereviewer');
  });
});
