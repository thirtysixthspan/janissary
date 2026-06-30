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
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('mytab')).toBeInTheDocument();
  });

  it('renders title instead of label when title is set', () => {
    const tab = makeTab({ label: 'internal', title: 'Display Name' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Display Name')).toBeInTheDocument();
  });

  it('marks the active tab with the active class', () => {
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    const { container } = render(
      <TabStrip tabs={tabs} activeTab={1} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const tabEls = container.querySelectorAll('.tab');
    expect(tabEls[0]).not.toHaveClass('active');
    expect(tabEls[1]).toHaveClass('active');
  });

  it('calls onSelect with the tab index when clicked', async () => {
    const onSelect = vi.fn();
    const tabs = [makeTab({ label: 'a' }), makeTab({ label: 'b' })];
    render(<TabStrip tabs={tabs} activeTab={0} onSelect={onSelect} onClose={vi.fn()} />);
    await userEvent.click(screen.getByText('b'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows a close button for harness tabs and renders the harness name', () => {
    const tab = makeTab({ label: 'claude', view: 'harness', title: 'claude' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('claude')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('shows a close button for page tabs and renders the title', () => {
    const tab = makeTab({ label: 'page-1', view: 'page', title: '1) slashdot.org' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('1) slashdot.org')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('calls onClose and stops propagation when the close button is clicked', async () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    const tab = makeTab({ label: 'img', view: 'image' });
    render(<TabStrip tabs={[tab]} activeTab={0} onSelect={onSelect} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledWith(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies busy class to the dot when tab is busy', () => {
    const tab = makeTab({ busy: true });
    const { container } = render(
      <TabStrip tabs={[tab]} activeTab={0} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.querySelector('.dot.busy')).toBeInTheDocument();
  });
});
