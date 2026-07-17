import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AggregatedScheduleView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { SchedulesTab } from './SchedulesTab';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTab(label: string): TabView {
  return {
    label, number: 1, dotColor: '#5b9cff', group: 1, groupColor: '#5b9cff',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
  };
}

const entries: AggregatedScheduleView[] = [
  { tab: 'harness-1', id: 's1', spec: 'at 3pm', next: 'Jan 1 3:00pm', recurring: false, command: 'echo hi' },
  { tab: 'agent-1', id: 's2', spec: 'every 5m', next: 'Jan 1 3:05pm', recurring: true, command: 'clear' },
];

describe('SchedulesTab', () => {
  it('renders one numbered row per aggregated entry with its fields, preserving the given order', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} index={0} />);
    const rows = [...container.querySelectorAll('.schedules-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('1)');
    expect(rows[0].textContent).toContain('harness-1');
    expect(rows[0].textContent).toContain('echo hi');
    expect(rows[1].textContent).toContain('2)');
    expect(rows[1].textContent).toContain('agent-1');
    expect(rows[1].textContent).toContain('clear');
  });

  it('renders column headings above the rows', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} index={0} />);
    expect(container.querySelector('.schedules-headings')?.textContent).toContain('Owner');
    expect(container.querySelector('.schedules-headings')?.textContent).toContain('Command');
  });

  it('marks recurring entries with the recurring class', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} index={0} />);
    const rows = [...container.querySelectorAll('.schedules-row')];
    expect(rows[0].classList.contains('recurring')).toBe(false);
    expect(rows[1].classList.contains('recurring')).toBe(true);
  });

  it('shows "No scheduled commands." when the list is empty', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<SchedulesTab entries={[]} tabs={[]} client={client} index={0} />);
    expect(screen.getByText('No scheduled commands.')).toBeTruthy();
  });

  it('a single click selects a row without sending setActiveTab', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab('other'), makeTab('agent-1')];
    const { container } = render(<SchedulesTab entries={entries} tabs={tabs} client={client} index={0} />);
    const row = container.querySelectorAll('.schedules-row')[1];
    fireEvent.click(row);
    expect(send).not.toHaveBeenCalled();
    expect(row.classList.contains('selected')).toBe(true);
  });

  it('a double click sends setActiveTab with the owning tab index', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab('other'), makeTab('agent-1')];
    const { container } = render(<SchedulesTab entries={entries} tabs={tabs} client={client} index={0} />);
    fireEvent.doubleClick(container.querySelectorAll('.schedules-row')[1]);
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 1 } });
  });

  it('ArrowDown then Enter focuses the second entry\'s owning tab', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab('harness-1'), makeTab('agent-1')];
    const { container } = render(<SchedulesTab entries={entries} tabs={tabs} client={client} index={0} />);
    const wrapper = container.querySelector('.schedules-tab')!;
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 1 } });
  });

  it('ArrowUp with no prior selection stays clamped at the first row', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab('harness-1'), makeTab('agent-1')];
    const { container } = render(<SchedulesTab entries={entries} tabs={tabs} client={client} index={0} />);
    const wrapper = container.querySelector('.schedules-tab')!;
    fireEvent.keyDown(wrapper, { key: 'ArrowUp' });
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 0 } });
  });

  it('renders the compressed one-line form in compact mode, showing only the time', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} compact index={0} />);
    expect(container.querySelector('.schedules-compact')).not.toBeNull();
    expect(container.querySelector('.schedules-command')).toBeNull();
    expect(container.querySelectorAll('.schedules-row')).toHaveLength(2);
    expect(container.querySelector('.schedules-next')?.textContent).toBe('3:00pm');
  });

  it('has no dock-cycle button without a dock prop', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} index={0} />);
    expect(container.querySelector('.schedules-dock-cycle')).toBeNull();
  });

  it('clicking the dock-cycle button sends setDock with the other side', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} dock="left" index={3} />);
    const button = container.querySelector('.schedules-dock-cycle')!;
    fireEvent.click(button);
    expect(send).toHaveBeenCalledWith({ method: 'setDock', params: { index: 3, dock: 'right' } });
  });
});
