import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleRow } from '@shared/plugins/schedules/shared';
import type { TabPluginClientCapabilities } from '../api';
import { SchedulesTab } from './SchedulesTab';

function row(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'fetch', spec: 'every 5m', next: 'Jan 1 3:00pm', recurring: false,
    tab: 'agent-1', command: 'echo hi', ...overrides,
  };
}

function makeCapabilities(dock: 'left' | 'right' | null = null, onSplit?: () => void) {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) =>
      intent(name, payload) as Promise<Result>,
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

  it('renders the empty state and disables clearing when there is nothing scheduled', () => {
    renderTab([]);

    expect(screen.getByText('No scheduled commands.')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear all schedules')).toBeDisabled();
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

  it('sends the clear intent from the clear button', () => {
    const { intent } = renderTab([row()]);

    fireEvent.click(screen.getByLabelText('Clear all schedules'));

    expect(intent).toHaveBeenCalledWith('clear', {});
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
});
