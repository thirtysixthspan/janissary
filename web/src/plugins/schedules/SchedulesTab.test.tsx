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
  const openScheduleLaunch = vi.fn();
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
    copyText: vi.fn(),
    splitAction: onSplit ? <button type="button" className="tab-split" onClick={onSplit}>Split</button> : null,
    active: true,
    dock,
    close: vi.fn(),
    openScheduleLaunch,
    reportFailure: vi.fn(),
  };
  return { capabilities, intent, openScheduleLaunch };
}

function renderTab(entries: ScheduleRow[], dock: 'left' | 'right' | null = null, onSplit?: () => void) {
  const { capabilities, intent, openScheduleLaunch } = makeCapabilities(dock, onSplit);
  const rendered = render(<SchedulesTab payload={{ entries }} capabilities={capabilities} />);
  return { ...rendered, intent, openScheduleLaunch };
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

    expect(headings).toEqual(['', 'Agent', 'Id', 'Timing', 'Next Run', 'Command', '']);
    expect(cells).toEqual(['1)', 'agent-1', 'fetch', 'every 5m', 'Jan 1 3:00pm', 'echo hi', '']);
  });

  it('names the compressed columns Next Run, Id, Agent', () => {
    const { container } = renderTab([row()], 'right');

    const headings = [...container.querySelectorAll(':scope .schedules-headings > span')].map((cell) => cell.textContent);
    expect(headings).toEqual(['', 'Next Run', 'Id', 'Agent', '']);
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

describe('SchedulesTab new schedule button', () => {
  it('offers the New schedule button in the metadata row when there are no rows', () => {
    renderTab([]);

    expect(screen.getByRole('button', { name: 'New schedule' })).toBeInTheDocument();
  });

  it('offers the New schedule button beside the rows too', () => {
    renderTab([row()]);

    expect(screen.getByRole('button', { name: 'New schedule' })).toBeInTheDocument();
  });

  it('opens the New schedule dialog on click, without sending an intent', () => {
    const { intent, openScheduleLaunch } = renderTab([row()]);

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));

    expect(openScheduleLaunch).toHaveBeenCalledTimes(1);
    expect(intent).not.toHaveBeenCalled();
  });

  it('keeps the button in the docked rendering, next to the host split action', () => {
    const { container, openScheduleLaunch } = renderTab([row()], 'left', vi.fn());

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));

    expect(openScheduleLaunch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.schedules-compact')).not.toBeNull();
    expect(container.querySelector('.plugin-actions')).toContainElement(screen.getByRole('button', { name: 'Split' }));
  });
});

describe('SchedulesTab pause and resume', () => {
  function recurringSystem(overrides: { id?: string; paused?: true; next?: string } = {}): ScheduleRow {
    const id = overrides.id ?? 'ping';
    const fields = {
      id, spec: 'every 1m', next: overrides.next ?? 'in 1m', tab: 'system',
      command: `script ${id}`, recurring: true, owner: 'system' as const, key: id,
    };
    return overrides.paused ? { ...fields, paused: overrides.paused } : fields;
  }

  const identity = { tab: 'system', owner: 'system', key: 'ping', id: 'ping' };

  it('offers the control only on recurring system rows, in both layouts', () => {
    const entries = [
      recurringSystem(),
      recurringSystem({ id: 'nightly', paused: true, next: 'paused' }),
      row({ id: 'once', tab: 'system', owner: 'system', key: 'once-key' }),
      row({ id: 'tab-recurring', recurring: true }),
    ];

    for (const dock of [null, 'right'] as const) {
      const rendered = renderTab(entries, dock);
      const pause = screen.getByLabelText('Pause schedule ping');
      const resume = screen.getByLabelText('Resume schedule nightly');

      expect(pause).toHaveAttribute('title', 'Pause schedule ping');
      expect(resume).toHaveAttribute('title', 'Resume schedule nightly');
      expect(pause).not.toHaveAttribute('aria-pressed');
      expect(pause.querySelector('svg')).toHaveAttribute('data-icon', 'pause');
      expect(resume.querySelector('svg')).toHaveAttribute('data-icon', 'play');
      expect(screen.queryByLabelText('Pause schedule once')).toBeNull();
      expect(screen.queryByLabelText('Pause schedule tab-recurring')).toBeNull();
      expect(rendered.container.querySelectorAll('.schedules-row-pause')).toHaveLength(2);
      rendered.unmount();
    }
  });

  it('sends one pause intent on press, leaving the selection and the delete dialog alone', () => {
    const { container, intent } = renderTab([row({ id: 'other' }), recurringSystem()]);
    const list = container.querySelector('.schedules-tab')!;

    fireEvent.click(screen.getByLabelText('Pause schedule ping'));

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('pause', identity);
    expect(container.querySelectorAll('.schedules-row.selected')).toHaveLength(0);
    expect(screen.queryByText('Delete schedule "ping"?')).toBeNull();
    expect(document.activeElement).toBe(list);
  });

  it('sends the resume intent when the row is paused', () => {
    const { intent } = renderTab([recurringSystem({ paused: true, next: 'paused' })]);

    fireEvent.click(screen.getByLabelText('Resume schedule ping'));

    expect(intent).toHaveBeenCalledTimes(1);
    expect(intent).toHaveBeenCalledWith('resume', identity);
  });

  it('counts a double-click on the control as one press without focusing the owner', () => {
    const { intent } = renderTab([recurringSystem()]);
    const button = screen.getByLabelText('Pause schedule ping');

    fireEvent.click(button, { detail: 1 });
    fireEvent.click(button, { detail: 2 });
    fireEvent.doubleClick(button);

    expect(intent.mock.calls.map(([name]) => name)).toEqual(['pause']);
  });

  it('toggles only a selected recurring system row with Space and p', () => {
    const { container, intent } = renderTab([recurringSystem(), row({ id: 'other' })]);
    const list = container.querySelector('.schedules-tab')!;

    fireEvent.keyDown(list, { key: ' ' });
    expect(intent).not.toHaveBeenCalled();

    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: ' ' });
    expect(intent).toHaveBeenLastCalledWith('pause', identity);

    intent.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'p' });
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'p', metaKey: true });
    fireEvent.keyDown(list, { key: 'p', ctrlKey: true });
    fireEvent.keyDown(list, { key: 'p', altKey: true });
    expect(intent).not.toHaveBeenCalled();
  });

  it('does not bubble a consumed Space past the list', () => {
    const { container, intent } = renderTab([recurringSystem()]);
    const list = container.querySelector('.schedules-tab')!;
    const onBodyKeyDown = vi.fn();
    document.body.addEventListener('keydown', onBodyKeyDown);

    try {
      fireEvent.keyDown(list, { key: 'Home' });
      onBodyKeyDown.mockClear();
      fireEvent.keyDown(list, { key: ' ' });

      expect(onBodyKeyDown).not.toHaveBeenCalled();
      expect(intent).toHaveBeenCalledWith('pause', identity);
    } finally {
      document.body.removeEventListener('keydown', onBodyKeyDown);
    }
  });

  it('reads paused with a muted class in both layouts', () => {
    const entries = [recurringSystem({ paused: true, next: 'paused' })];

    for (const dock of [null, 'right'] as const) {
      const rendered = renderTab(entries, dock);
      const renderedRow = rendered.container.querySelector('.schedules-row')!;

      expect(renderedRow).toHaveClass('paused', 'recurring');
      expect(renderedRow.querySelector('.schedules-next')).toHaveTextContent('paused');
      rendered.unmount();
    }
  });
});
