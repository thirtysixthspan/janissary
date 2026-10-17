import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleRow } from '@shared/plugins/schedules/shared';
import type { TabPluginClientCapabilities } from '../api';
import { SchedulesTab } from './SchedulesTab';

function row(
  overrides: Partial<Omit<ScheduleRow, 'owner' | 'key'>> & { owner?: 'system'; key?: string } = {},
): ScheduleRow {
  const fields: Omit<ScheduleRow, 'owner' | 'key'> = {
    id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: false,
    tab: 'agent-1', command: 'echo hi', ...overrides,
  };
  return overrides.owner === 'system'
    ? { ...fields, owner: 'system', key: overrides.key ?? 'system-key' }
    : fields;
}

function makeCapabilities(dock: 'left' | 'right' | null = null, onSplit?: () => void) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: onSplit ? <button type="button" className="tab-split" onClick={onSplit}>Split</button> : null,
    active: true,
    dock,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { capabilities, intent };
}

function renderTab(entries: ScheduleRow[], dock: 'left' | 'right' | null = null, onSplit?: () => void) {
  const { capabilities, intent } = makeCapabilities(dock, onSplit);
  const rendered = render(<SchedulesTab payload={{ entries }} capabilities={capabilities} />);
  return { ...rendered, intent };
}

// jsdom implements no scrolling, and the list keeps the selected row in view on every move.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('SchedulesTab', () => {
  it('renders the full layout in the centre strip', () => {
    const { container } = renderTab([row()]);

    expect(container.querySelector('.schedules-compact')).toBeNull();
    expect(screen.getByText('Command')).toBeInTheDocument();
    expect(screen.getByText('echo hi')).toBeInTheDocument();
    expect(screen.getByText('every 5m')).toBeInTheDocument();
  });

  // Placement is host-owned: the compressed layout follows `capabilities.dock`, not anything the
  // plugin measures for itself.
  it('renders the compressed layout when the host reports the tab docked', () => {
    const { container } = renderTab([row()], 'right');

    expect(container.querySelector('.schedules-compact')).not.toBeNull();
    expect(screen.queryByText('Command')).not.toBeInTheDocument();
    expect(screen.getByText('3:00pm')).toBeInTheDocument();
  });

  it('renders the empty state with no section titles when there is nothing scheduled', () => {
    renderTab([]);

    expect(screen.getByText('No scheduled commands.')).toBeInTheDocument();
    expect(screen.queryByText('System Schedules')).toBeNull();
    expect(screen.queryByText('Tab Schedules')).toBeNull();
  });

  it('renders the host\'s split action when one is supplied, and nothing when it is not', () => {
    const onSplit = vi.fn();
    const withSplit = renderTab([row()], null, onSplit);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(onSplit).toHaveBeenCalled();
    withSplit.unmount();

    const { container } = renderTab([row()]);
    expect(container.querySelector('.tab-split')).toBeNull();
  });

  it('marks a recurring row so it reads apart from a one-shot', () => {
    const { container } = renderTab([row({ recurring: true })]);
    expect(container.querySelector('.schedules-row.recurring')).not.toBeNull();
  });

  it('moves the selection with the arrow, Home, and End keys', () => {
    const { container } = renderTab([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
    const list = container.querySelector('.schedules-tab')!;
    const selected = () => [...container.querySelectorAll('.schedules-row')]
      .findIndex((element) => element.classList.contains('selected'));

    // With nothing selected the first ArrowDown moves off the implicit first row, and the clamp is
    // non-wrapping at both ends.
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selected()).toBe(2);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selected()).toBe(2);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(list, { key: 'End' });
    expect(selected()).toBe(2);
  });

  it('focuses the owning tab on a double click and on Enter', () => {
    const { container, intent } = renderTab([row()]);
    const list = container.querySelector('.schedules-tab')!;

    fireEvent.doubleClick(container.querySelector('.schedules-row')!);
    expect(intent).toHaveBeenCalledWith('focus-owner', { tab: 'agent-1' });

    intent.mockClear();
    fireEvent.click(container.querySelector('.schedules-row')!);
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(intent).toHaveBeenCalledWith('focus-owner', { tab: 'agent-1' });
  });

  it('confirms before cancelling a schedule, and sends nothing when the user backs out', () => {
    const { container, intent } = renderTab([row()]);
    const list = container.querySelector('.schedules-tab')!;
    fireEvent.click(container.querySelector('.schedules-row')!);

    fireEvent.keyDown(list, { key: 'Delete' });
    expect(screen.getByText('Delete schedule "fetch"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(intent).not.toHaveBeenCalled();

    fireEvent.keyDown(list, { key: 'Backspace' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenCalledWith('cancel', { tab: 'agent-1', id: 'fetch' });
  });

  it.each([null, 'left'] as const)('uses owner keys for duplicate system rows in %s mode', (dock) => {
    const entries = [
      row({ id: 'build', tab: 'system', command: 'script build', owner: 'system', key: 'first' }),
      row({ id: 'build', tab: 'system', command: 'script build', owner: 'system', key: 'second' }),
    ];
    const { container, intent } = renderTab(entries, dock);
    const list = container.querySelector('.schedules-tab')!;
    const renderedRows = container.querySelectorAll('.schedules-row');
    expect(renderedRows).toHaveLength(2);

    fireEvent.doubleClick(renderedRows[1]!);
    expect(intent).toHaveBeenCalledWith('focus-owner', {
      tab: 'system', owner: 'system', key: 'second',
    });

    fireEvent.click(renderedRows[1]!);
    fireEvent.keyDown(list, { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenLastCalledWith('cancel', {
      tab: 'system', owner: 'system', key: 'second', id: 'build',
    });
  });
});

describe('SchedulesTab sections', () => {
  const systemRow = () => row({
    id: 'nightly', tab: 'system', command: 'script nightly', owner: 'system', key: 'nightly-key',
  });

  it('renders the system section above the tab section, each with its own headings row', () => {
    const { container } = renderTab([row({ id: 'standup' }), systemRow()]);
    const sections = container.querySelectorAll('.schedules-section');

    expect(sections).toHaveLength(2);
    expect(sections[0]!.textContent).toContain('nightly');
    expect(sections[1]!.textContent).toContain('standup');
    for (const section of sections) {
      expect(section.querySelectorAll(':scope .schedules-headings')).toHaveLength(1);
    }
  });

  it.each([null, 'left'] as const)('gives each section a headings row in %s mode', (dock) => {
    const { container } = renderTab([row({ id: 'standup' }), systemRow()], dock);

    expect(container.querySelectorAll('.schedules-headings')).toHaveLength(2);
  });

  it('renders only the tab section when no project-owned rows exist', () => {
    const { container } = renderTab([row()]);

    expect(container.querySelectorAll('.schedules-section')).toHaveLength(1);
    expect(container.querySelectorAll('.schedules-headings')).toHaveLength(1);
  });

  it('offers no clear control in either section, so bulk clearing stays on the commands', () => {
    renderTab([row({ id: 'standup' }), systemRow()]);

    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
  });

  it('titles each section above its headings, and omits the title of an empty section', () => {
    const { container } = renderTab([row({ id: 'standup' })]);

    expect(screen.queryByText('System Schedules')).toBeNull();
    expect(container.querySelector('.schedules-section')!.firstElementChild).toHaveTextContent('Tab Schedules');
  });

  it('shows each section title, system first, with that section\'s rows beneath it', () => {
    const { container } = renderTab([row({ id: 'standup' }), systemRow()]);
    const titles = [...container.querySelectorAll('.schedules-section-title')].map((element) => element.textContent);

    expect(titles).toEqual(['System Schedules', 'Tab Schedules']);
    const sections = container.querySelectorAll('.schedules-section');
    expect(sections[0]!.querySelector('.schedules-row')).toHaveTextContent('nightly');
    expect(sections[1]!.querySelector('.schedules-row')).toHaveTextContent('standup');
  });

  it('orders the full columns as Agent, Id, Timing, Next Run, Command, with each row matching', () => {
    const { container } = renderTab([row({ id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', command: 'echo hi' })]);

    const headings = [...container.querySelectorAll(':scope .schedules-headings > span')].map((cell) => cell.textContent);
    const cells = [...container.querySelectorAll(':scope .schedules-row > span')].map((cell) => cell.textContent);

    expect(headings).toEqual(['', 'Agent', 'Id', 'Timing', 'Next Run', 'Command']);
    expect(cells).toEqual(['1)', 'agent-1', 'fetch', 'every 5m', 'Jan 1 3:00pm', 'echo hi']);
  });

  it('names the compressed columns Next Run, Id, Agent', () => {
    const { container } = renderTab([row()], 'right');

    const headings = [...container.querySelectorAll(':scope .schedules-headings > span')].map((cell) => cell.textContent);
    expect(headings).toEqual(['', 'Next Run', 'Id', 'Agent']);
  });

  it('numbers rows continuously from the top across both sections', () => {
    const { container } = renderTab([row({ id: 'standup' }), systemRow()]);
    const numbers = [...container.querySelectorAll(':scope .schedules-row .schedules-num')]
      .map((element) => element.textContent);

    expect(numbers).toEqual(['1)', '2)']);
  });

  it('follows the on-screen order for keyboard focus, so Home then Enter focuses the system row', () => {
    const { container, intent } = renderTab([row({ id: 'standup' }), systemRow()]);
    const list = container.querySelector('.schedules-tab')!;

    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'Enter' });

    expect(intent).toHaveBeenCalledWith('focus-owner', {
      tab: 'system', owner: 'system', key: 'nightly-key',
    });
  });
});

describe('SchedulesTab cell text', () => {
  it('shows the full command on hover, since a long one is shortened in its column', () => {
    const command = 'npm run build -- --watch --profile=production --output=dist/app-bundle';
    const { container } = renderTab([row({ command })]);

    expect(container.querySelector('.schedules-command')).toHaveAttribute('title', command);
  });

  it('shows the full next-run time on hover in the compressed layout', () => {
    renderTab([row({ next: 'Jan 1 3:00pm' })], 'right');

    expect(screen.getByText('3:00pm')).toHaveAttribute('title', 'Jan 1 3:00pm');
  });
});

describe('SchedulesTab row delete', () => {
  const systemRow = () => row({
    id: 'nightly', tab: 'system', command: 'script nightly', owner: 'system', key: 'nightly-key',
  });

  it('asks before deleting only the schedule in the row whose icon was pressed', () => {
    const { intent } = renderTab([row({ id: 'a' }), row({ id: 'b' })]);

    fireEvent.click(screen.getByLabelText('Delete schedule b'));
    expect(screen.getByText('Delete schedule "b"?')).toBeInTheDocument();
    expect(intent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('cancel', { tab: 'agent-1', id: 'b' });
  });

  it('leaves the schedule in place when the user backs out', () => {
    const { intent } = renderTab([row({ id: 'a' })]);

    fireEvent.click(screen.getByLabelText('Delete schedule a'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(intent).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete schedule "a"?')).toBeNull();
  });

  it('confirms a system row by its key', () => {
    const { intent } = renderTab([systemRow()]);

    fireEvent.click(screen.getByLabelText('Delete schedule nightly'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(intent).toHaveBeenCalledWith('cancel', {
      tab: 'system', owner: 'system', key: 'nightly-key', id: 'nightly',
    });
  });

  it('does not move the selection when the icon is pressed', () => {
    const { container } = renderTab([row({ id: 'a' }), row({ id: 'b' })]);

    fireEvent.click(screen.getByLabelText('Delete schedule b'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(container.querySelectorAll('.schedules-row.selected')).toHaveLength(0);
  });

  it('offers the icon in the compressed layout too', () => {
    renderTab([row({ id: 'fetch' })], 'right');

    expect(screen.getByLabelText('Delete schedule fetch')).toBeInTheDocument();
  });
});
