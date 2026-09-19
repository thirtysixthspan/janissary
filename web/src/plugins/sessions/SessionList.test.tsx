import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRow } from '@shared/plugins/sessions/shared';
import type { TabPluginClientCapabilities } from '../api';
import { SessionList } from './SessionList';

function capabilities() {
  const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
  const value: TabPluginClientCapabilities = {
    resourceUrl: (reference) => reference,
    intent: async <Result,>(name: string, payload: unknown) => intent(name, payload) as Promise<Result>,
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { intent, value };
}

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'claude', host: 'devbox', name: 'claude', kind: 'harness', state: 'active',
    activity: Date.now(), destination: 'devbox', workspace: '/srv/ws', joined: false,
    actions: ['focus', 'detach'], label: 'claude',
    ...overrides,
  };
}

function list(entries: SessionRow[], value = capabilities().value) {
  return render(<SessionList payload={{ entries }} capabilities={value} />);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('SessionList rendering', () => {
  it('reports an empty list rather than an empty pane', () => {
    list([]);
    expect(screen.getByText('No remote sessions')).toBeInTheDocument();
  });

  it('renders the rows host, type, tab name, state, time, actions', () => {
    const { container } = list([
      row({ id: 'a', name: 'claude' }),
      row({ id: 'b', name: 'bekir', kind: 'agent' }),
    ]);
    expect([...container.querySelectorAll('.session-row-name')].map((node) => node.textContent))
      .toEqual(['claude', 'bekir']);
    expect([...container.querySelectorAll('.session-row-kind')].map((node) => node.textContent))
      .toEqual(['harness', 'agent']);
    expect(container.querySelectorAll('.session-row-host')).toHaveLength(2);
    expect(container.querySelectorAll('.session-row-state')).toHaveLength(2);
    expect(container.querySelectorAll('time')).toHaveLength(2);
  });

  it('names the columns above the rows, leaving the action column unlabeled', () => {
    const { container } = list([row()]);
    const columns = container.querySelector('.session-columns');
    expect(columns).not.toBeNull();
    expect([...columns!.querySelectorAll('span')].map((node) => node.textContent))
      .toEqual(['Host', 'Type', 'Tab', 'State', 'Last activity', '']);
  });

  it.each(['provisioning', 'active', 'reconnecting', 'detached', 'ended'] as const)(
    'renders a %s row with that state on it',
    (state) => {
      const { container } = list([row({ state, actions: [] })]);
      expect(container.querySelector('.session-row')).toHaveAttribute('data-state', state);
    },
  );

  // The indent is the grouping: one glance shows what a single detach would take with it.
  it('indents a row that rides another row\'s channel', () => {
    const { container } = list([row({ id: 'a' }), row({ id: 'b', joined: true })]);
    const rows = container.querySelectorAll('.session-row');
    expect(rows[0]).not.toHaveClass('joined');
    expect(rows[1]).toHaveClass('joined');
  });

  it('carries the full destination and workspace in the row\'s tooltip', () => {
    const { container } = list([row({ destination: 'admin@devbox', workspace: '/srv/ws' })]);
    expect(container.querySelector('.session-row')).toHaveAttribute(
      'title', expect.stringContaining('admin@devbox') as unknown as string,
    );
  });

  it('focuses the active list and highlights its first row', () => {
    const { container } = list([row({ id: 'a' }), row({ id: 'b' })]);
    expect(container.querySelector('.session-list')).toHaveFocus();
    expect(container.querySelector('.session-row')).toHaveClass('selected');
  });
});

describe('SessionList buttons', () => {
  it('offers only the verbs the row carries', () => {
    list([row({ actions: ['focus', 'detach'] })]);
    expect(screen.getByLabelText('Disconnect claude')).toBeInTheDocument();
    expect(screen.queryByLabelText('Reconnect claude')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End session claude')).not.toBeInTheDocument();
  });

  // `focus` is what opening the row already does, so it carries no button of its own.
  it('renders no button for focus', () => {
    const { container } = list([row({ actions: ['focus'] })]);
    expect(container.querySelectorAll(':scope .session-row-actions button')).toHaveLength(0);
  });

  it('disables detach while the workspace is still provisioning', () => {
    list([row({ state: 'provisioning' })]);
    expect(screen.getByLabelText('Disconnect claude')).toBeDisabled();
  });

  // A second End would open a second ssh connection to the same peer and leak the first, since the
  // end channel is keyed by a label the second attempt overwrites.
  it('holds the destructive buttons while an end attempt is in flight', () => {
    list([row({
      state: 'detached', actions: ['reattach', 'end', 'forget'], session: 's1', ending: true,
    })]);
    expect(screen.getByLabelText('End session claude')).toBeDisabled();
    expect(screen.getByLabelText('Reconnect claude')).toBeDisabled();
  });

  it('leaves them pressable on a parked row with no attempt running', () => {
    list([row({ state: 'detached', actions: ['reattach', 'end'], session: 's1' })]);
    expect(screen.getByLabelText('End session claude')).toBeEnabled();
    expect(screen.getByLabelText('Reconnect claude')).toBeEnabled();
  });

  it('raises reattach straight away, with no confirmation', () => {
    const fixture = capabilities();
    list([row({ state: 'detached', actions: ['reattach'], session: 's1' })], fixture.value);
    fireEvent.click(screen.getByLabelText('Reconnect claude'));
    expect(fixture.intent).toHaveBeenCalledWith('reattach', { id: 'claude' });
  });

  // Forgetting removes a record and touches nothing, so it needs no dialog.
  it('raises forget straight away, with no confirmation', () => {
    const fixture = capabilities();
    list([row({ state: 'detached', actions: ['forget'], session: 's1' })], fixture.value);
    fireEvent.click(screen.getByLabelText('Forget session claude'));
    expect(fixture.intent).toHaveBeenCalledWith('forget', { id: 'claude' });
  });

  it('raises close on a row that carries it', () => {
    const fixture = capabilities();
    list([row({ joined: true, actions: ['focus', 'close'] })], fixture.value);
    fireEvent.click(screen.getByLabelText('Close claude'));
    expect(fixture.intent).toHaveBeenCalledWith('close', { id: 'claude' });
  });

  it('raises refresh from the header without touching a row', () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(fixture.intent).toHaveBeenCalledWith('refresh', {});
  });
});

describe('SessionList refresh on focus', () => {
  it('re-reads each time the tab becomes active again, not on mount', () => {
    const fixture = capabilities();
    const { rerender } = list([row()], fixture.value);
    expect(fixture.intent).not.toHaveBeenCalled();

    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...fixture.value, active: false }} />);
    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...fixture.value, active: true }} />);
    expect(fixture.intent).toHaveBeenCalledWith('refresh', {});
    expect(fixture.intent).toHaveBeenCalledTimes(1);

    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...fixture.value, active: false }} />);
    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...fixture.value, active: true }} />);
    expect(fixture.intent).toHaveBeenCalledWith('refresh', {});
    expect(fixture.intent).toHaveBeenCalledTimes(2);
  });

  it('sends the intent once per return to the tab', () => {
    const first = capabilities();
    const { rerender } = list([row()], first.value);
    expect(first.intent).not.toHaveBeenCalled();

    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...first.value, active: false }} />);
    rerender(<SessionList payload={{ entries: [row()] }} capabilities={first.value} />);
    rerender(<SessionList payload={{ entries: [row()] }} capabilities={{ ...first.value, active: false }} />);
    rerender(<SessionList payload={{ entries: [row()] }} capabilities={first.value} />);
    expect(first.intent).toHaveBeenCalledTimes(2);
    expect(first.intent).toHaveBeenCalledWith('refresh', {});
  });
});

describe('SessionList confirmations', () => {
  it('asks before detaching, since tabs disappear', () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Disconnect claude'));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Disconnect claude on devbox?');
    expect(fixture.intent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Disconnect', { selector: '.modal-button' }));
    expect(fixture.intent).toHaveBeenCalledWith('detach', { id: 'claude' });
  });

  it('asks before ending, since it destroys the far-side workspace', () => {
    const fixture = capabilities();
    list([row({ state: 'detached', actions: ['reattach', 'end'], session: 's1' })], fixture.value);
    fireEvent.click(screen.getByLabelText('End session claude'));

    expect(screen.getByRole('alertdialog')).toHaveTextContent('End claude on devbox?');
    fireEvent.click(screen.getByText('End session', { selector: '.modal-button' }));
    expect(fixture.intent).toHaveBeenCalledWith('end', { id: 'claude' });
  });

  it('raises nothing when the confirmation is cancelled', () => {
    const fixture = capabilities();
    list([row()], fixture.value);
    fireEvent.click(screen.getByLabelText('Disconnect claude'));
    fireEvent.click(screen.getByText('Cancel', { selector: '.modal-button' }));

    expect(fixture.intent).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('SessionList navigation', () => {
  it('moves the current row with the arrow keys and opens it with Enter', () => {
    const fixture = capabilities();
    const { container } = list([row({ id: 'a', label: 'a' }), row({ id: 'b', label: 'b' })], fixture.value);
    const node = container.querySelector('.session-list')!;

    fireEvent.keyDown(node, { key: 'ArrowDown' });
    expect(container.querySelectorAll('.session-row')[1]).toHaveClass('selected');

    fireEvent.keyDown(node, { key: 'Enter' });
    expect(fixture.intent).toHaveBeenCalledWith('focus', { id: 'b' });
  });

  it('takes two clicks on the same row to open it', () => {
    const fixture = capabilities();
    const { container } = list([row({ id: 'a' }), row({ id: 'b' })], fixture.value);
    const second = container.querySelectorAll('.session-row')[1];

    fireEvent.click(second);
    expect(fixture.intent).not.toHaveBeenCalled();

    fireEvent.click(second);
    expect(fixture.intent).toHaveBeenCalledWith('focus', { id: 'b' });
  });

  it('opens a detached row by reattaching it', () => {
    const fixture = capabilities();
    const { container } = list(
      [row({ state: 'detached', actions: ['reattach', 'end'], session: 's1' })], fixture.value,
    );
    const only = container.querySelector('.session-row')!;
    fireEvent.click(only);
    fireEvent.click(only);
    expect(fixture.intent).toHaveBeenCalledWith('reattach', { id: 'claude' });
  });

  it('does nothing when an ended row is opened', () => {
    const fixture = capabilities();
    const { container } = list([row({ state: 'ended', actions: ['forget'], session: 's1' })], fixture.value);
    const only = container.querySelector('.session-row')!;
    fireEvent.click(only);
    fireEvent.click(only);
    expect(fixture.intent).not.toHaveBeenCalled();
  });
});
