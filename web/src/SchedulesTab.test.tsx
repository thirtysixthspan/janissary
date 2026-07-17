import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { AggregatedScheduleView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { SchedulesTab } from './SchedulesTab';

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
  it('renders one row per aggregated entry with its fields, preserving the given order', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} />);
    const rows = [...container.querySelectorAll('.schedules-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('harness-1');
    expect(rows[0].textContent).toContain('echo hi');
    expect(rows[1].textContent).toContain('agent-1');
    expect(rows[1].textContent).toContain('clear');
  });

  it('marks recurring entries with the recurring class', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} />);
    const rows = [...container.querySelectorAll('.schedules-row')];
    expect(rows[0].classList.contains('recurring')).toBe(false);
    expect(rows[1].classList.contains('recurring')).toBe(true);
  });

  it('shows "No scheduled commands." when the list is empty', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    render(<SchedulesTab entries={[]} tabs={[]} client={client} />);
    expect(screen.getByText('No scheduled commands.')).toBeTruthy();
  });

  it('clicking a row sends setActiveTab with the owning tab index', () => {
    const send = vi.fn();
    const client = { send } as unknown as JanusClient;
    const tabs = [makeTab('other'), makeTab('agent-1')];
    const { container } = render(<SchedulesTab entries={entries} tabs={tabs} client={client} />);
    fireEvent.click(container.querySelectorAll('.schedules-row')[1]);
    expect(send).toHaveBeenCalledWith({ method: 'setActiveTab', params: { index: 1 } });
  });

  it('renders the compressed one-line form in compact mode without the command text', () => {
    const client = { send: vi.fn() } as unknown as JanusClient;
    const { container } = render(<SchedulesTab entries={entries} tabs={[]} client={client} compact />);
    expect(container.querySelector('.schedules-compact')).not.toBeNull();
    expect(container.querySelector('.schedules-command')).toBeNull();
    expect(container.querySelectorAll('.schedules-row')).toHaveLength(2);
  });
});
